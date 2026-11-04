import type { ZodType, ZodTypeDef } from "zod";
import { prisma, Prisma } from "@bloqer/database";
import type { Contact, ContactRole, ContactRoleType, TaxIdType } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { serializeMoney } from "@bloqer/utils";
import type {
  CreateContactInput,
  UpdateContactInput,
  AssignContactRoleInput,
  ListContactsInput,
  UpdateClientProfileInput,
  UpdateSupplierProfileInput,
  UpdateSubcontractorProfileInput,
} from "@bloqer/validators";
import {
  createContactSchema,
  updateContactSchema,
  assignContactRoleSchema,
  listContactsSchema,
  updateClientProfileSchema,
  updateSupplierProfileSchema,
  updateSubcontractorProfileSchema,
  argentineTaxIdSchema,
} from "@bloqer/validators";
import type { ClientProfile, SupplierProfile, SubcontractorProfile } from "@bloqer/database";
import { log } from "../audit/audit.service";
import { ServiceContext, ServiceError } from "../types";
import { assertTenantModuleEnabled } from "../tenant-modules/tenant-module.service";
import { lockContactForMutation } from "./assert-contact-role";

export type ContactWithRoles = Contact & {
  roles: ContactRole[];
  clientProfile: ClientProfile | null;
  supplierProfile: SupplierProfile | null;
  subcontractorProfile: SubcontractorProfile | null;
};

const ROLE_LABEL_ES: Record<ContactRoleType, string> = {
  CLIENT: "cliente",
  SUPPLIER: "proveedor",
  SUBCONTRACTOR: "subcontratista",
  EMPLOYEE: "empleado",
  OTHER: "otro",
};

function validateContactInput<T>(schema: ZodType<T, ZodTypeDef, unknown>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ServiceError("VALIDATION", result.error.issues[0]?.message ?? "Datos inválidos");
  return result.data;
}

function throwIfContactChanged(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === "P2025" || err.code === "P2002")) {
    throw new ServiceError("CONFLICT", "El contacto o su rol cambió. Volvé a cargar e intentá nuevamente.");
  }
  throw err;
}

function contactAuditSnapshot(contact: Contact) {
  return {
    legalName: contact.legalName,
    fantasyName: contact.fantasyName,
    taxId: contact.taxId,
    taxIdType: contact.taxIdType,
    ivaCondition: contact.ivaCondition,
    address: contact.address,
    city: contact.city,
    province: contact.province,
    country: contact.country,
    phone: contact.phone,
    email: contact.email,
    notes: contact.notes,
  };
}

function normalizeTaxId(taxId: string | null | undefined, type: TaxIdType | null | undefined) {
  if (!taxId) return taxId;
  if (type === "CUIT" || type === "CUIL") return validateContactInput(argentineTaxIdSchema, taxId);
  // Untyped historical identifiers may also be foreign. Only an unambiguous
  // numeric/formatted 11-digit value can safely use the same canonical form.
  if (type == null) {
    const parsed = argentineTaxIdSchema.safeParse(taxId);
    if (parsed.success) return parsed.data;
  }
  return taxId;
}

async function assertTaxIdAvailable(
  tx: Prisma.TransactionClient,
  taxId: string | null | undefined,
  type: TaxIdType | null | undefined,
  tenantId: string,
  excludeId: string | null = null,
): Promise<void> {
  if (!taxId) return;
  const normalized = (type === "CUIT" || type === "CUIL" || type == null)
    ? argentineTaxIdSchema.safeParse(taxId)
    : null;
  const digits = normalized?.success ? normalized.data : null;
  // The existing unique index protects concurrent canonical writes. This
  // tenant-scoped preflight also covers legacy formatting without rewriting it.
  const conflicts = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "contacts"
    WHERE "tenantId" = ${tenantId}
      AND (${excludeId}::text IS NULL OR "id" <> ${excludeId}::text)
      AND (
        "taxId" = ${taxId}
        OR (
          ${digits}::text IS NOT NULL
          AND (
            "taxIdType" IN ('CUIT', 'CUIL')
            OR ("taxIdType" IS NULL AND "taxId" ~ '^[0-9[:space:][:punct:]]+$')
          )
          AND regexp_replace("taxId", '[^0-9]', '', 'g') = ${digits}::text
        )
      )
    LIMIT 1
  `;
  if (conflicts.length > 0) {
    throw new ServiceError("CONFLICT", `Ya existe un contacto con ese CUIT/CUIL (${taxId})`);
  }
}

function isPrismaUniqueOnTaxId(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") return false;
  const target = err.meta?.target;
  if (Array.isArray(target)) return target.some((t) => String(t).toLowerCase().includes("taxid"));
  if (typeof target === "string") return target.toLowerCase().includes("taxid");
  return false;
}

function throwIfContactTaxIdConflict(err: unknown, taxId: string | null | undefined): void {
  if (isPrismaUniqueOnTaxId(err)) {
    throw new ServiceError(
      "CONFLICT",
      taxId
        ? `Ya existe un contacto con ese CUIT/CUIL (${taxId})`
        : "Ya existe un contacto con ese CUIT/CUIL",
    );
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    throw new ServiceError("CONFLICT", "No se pudo guardar: hay un dato duplicado");
  }
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getContactById(id: string, ctx: ServiceContext): Promise<ContactWithRoles> {
  if (!can(ctx.roles, "VIEW", "DIRECTORY")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions to view contacts");
  }
  await assertTenantModuleEnabled(ctx, "DIRECTORY");
  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      roles: { where: { tenantId: ctx.tenantId }, orderBy: [{ status: "asc" }, { role: "asc" }] },
      clientProfile: true,
      supplierProfile: true,
      subcontractorProfile: true,
    },
  });
  if (!contact) throw new ServiceError("NOT_FOUND", "Contacto no encontrado");
  if (contact.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  return contact;
}

export async function listContacts(
  filters: ListContactsInput,
  ctx: ServiceContext,
): Promise<{ data: ContactWithRoles[]; total: number }> {
  if (!can(ctx.roles, "VIEW", "DIRECTORY")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions to view contacts");
  }
  await assertTenantModuleEnabled(ctx, "DIRECTORY");
  return queryContacts(validateContactInput(listContactsSchema, filters), ctx);
}

async function queryContacts(
  filters: ListContactsInput,
  ctx: ServiceContext,
): Promise<{ data: ContactWithRoles[]; total: number }> {
  const search = filters.search?.trim();
  const taxIdSearch = search && argentineTaxIdSchema.safeParse(search);
  const taxIdMatches = taxIdSearch && taxIdSearch.success
    ? await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "contacts"
        WHERE "tenantId" = ${ctx.tenantId}
          AND (
            "taxIdType" IN ('CUIT', 'CUIL')
            OR ("taxIdType" IS NULL AND "taxId" ~ '^[0-9[:space:][:punct:]]+$')
          )
          AND regexp_replace("taxId", '[^0-9]', '', 'g') = ${taxIdSearch.data}
      `
    : [];
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;

  const where: Prisma.ContactWhereInput = {
    tenantId: ctx.tenantId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(search
      ? {
          OR: [
            { legalName: { contains: search, mode: "insensitive" } },
            { fantasyName: { contains: search, mode: "insensitive" } },
            { taxId: { contains: search } },
            ...(taxIdMatches.length > 0
              ? [{ id: { in: taxIdMatches.map((row) => row.id) } }]
              : []),
          ],
        }
      : {}),
    ...(filters.roles?.length
      ? { roles: { some: { tenantId: ctx.tenantId, role: { in: filters.roles }, status: "ACTIVE" } } }
      : filters.role
        ? { roles: { some: { tenantId: ctx.tenantId, role: filters.role, status: "ACTIVE" } } }
        : {}),
  };

  const [data, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      include: {
        roles: { where: { tenantId: ctx.tenantId, status: "ACTIVE" }, orderBy: { role: "asc" } },
        clientProfile: true,
        supplierProfile: true,
        subcontractorProfile: true,
      },
      orderBy: [{ legalName: "asc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.contact.count({ where }),
  ]);

  return { data, total };
}

/** Picker lists (AP payee, OC, clientes) must not silently truncate matching contacts. */
export async function listAllContacts(
  filters: Omit<ListContactsInput, "page" | "pageSize">,
  ctx: ServiceContext,
): Promise<ContactWithRoles[]> {
  if (!can(ctx.roles, "VIEW", "DIRECTORY")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions to view contacts");
  }
  await assertTenantModuleEnabled(ctx, "DIRECTORY");
  filters = validateContactInput(listContactsSchema, filters);
  const pageSize = 200;
  const acc: ContactWithRoles[] = [];
  let page = 1;
  let total = Infinity;
  while (acc.length < total) {
    const result = await queryContacts({ ...filters, page, pageSize }, ctx);
    if (page === 1) total = result.total;
    if (result.data.length === 0) break;
    acc.push(...result.data);
    if (acc.length >= total) break;
    page += 1;
  }
  return acc;
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createContact(
  input: CreateContactInput,
  ctx: ServiceContext,
): Promise<ContactWithRoles> {
  if (!can(ctx.roles, "EDIT", "DIRECTORY")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions to create contacts");
  }
  await assertTenantModuleEnabled(ctx, "DIRECTORY");
  input = validateContactInput(createContactSchema, input);
  input.taxId = normalizeTaxId(input.taxId, input.taxIdType);

  const { initialRole, ...contactData } = input;
  if (!initialRole) {
    throw new ServiceError("VALIDATION", "Elegí un rol");
  }

  let contact: ContactWithRoles;
  try {
    contact = await prisma.$transaction(async (tx) => {
      await assertTaxIdAvailable(tx, contactData.taxId, contactData.taxIdType, ctx.tenantId);
      const created = await tx.contact.create({
        data: {
          ...contactData,
          tenantId: ctx.tenantId,
          createdBy: ctx.actorUserId,
          updatedBy: ctx.actorUserId,
        },
      });

      await tx.contactRole.create({
        data: { contactId: created.id, tenantId: ctx.tenantId, role: initialRole },
      });
      await _createProfileIfNeeded(tx, created.id, initialRole, {});

      await log({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId,
        action: "contact.created",
        entityType: "Contact",
        entityId: created.id,
        after: { ...contactAuditSnapshot(created), initialRole },
        ipAddress: ctx.ipAddress,
      }, tx);

      return tx.contact.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          roles: { where: { tenantId: ctx.tenantId, status: "ACTIVE" }, orderBy: { role: "asc" } },
          clientProfile: true,
          supplierProfile: true,
          subcontractorProfile: true,
        },
      });
    });
  } catch (err) {
    throwIfContactTaxIdConflict(err, input.taxId);
    throw err;
  }

  return contact;
}

export async function updateContact(
  id: string,
  input: UpdateContactInput,
  ctx: ServiceContext,
): Promise<ContactWithRoles> {
  if (!can(ctx.roles, "EDIT", "DIRECTORY")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions to update contacts");
  }
  await assertTenantModuleEnabled(ctx, "DIRECTORY");
  input = validateContactInput(updateContactSchema, input);

  let updated: ContactWithRoles;
  try {
    updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.contact.findUnique({ where: { id } });
      if (!existing) throw new ServiceError("NOT_FOUND", "Contacto no encontrado");
      if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
      if (input.taxId !== undefined || input.taxIdType !== undefined) {
        const taxIdType = input.taxIdType ?? existing.taxIdType;
        input.taxId = normalizeTaxId(input.taxId === undefined ? existing.taxId : input.taxId, taxIdType);
        await assertTaxIdAvailable(tx, input.taxId, taxIdType, ctx.tenantId, id);
      }
      const result = await tx.contact.update({
        where: { id, tenantId: ctx.tenantId, updatedAt: existing.updatedAt },
        data: { ...input, updatedBy: ctx.actorUserId },
        include: {
          roles: { where: { tenantId: ctx.tenantId, status: "ACTIVE" }, orderBy: { role: "asc" } },
          clientProfile: true,
          supplierProfile: true,
          subcontractorProfile: true,
        },
      });
      await log({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId,
        action: "contact.updated",
        entityType: "Contact",
        entityId: id,
        before: contactAuditSnapshot(existing),
        after: contactAuditSnapshot(result),
        ipAddress: ctx.ipAddress,
      }, tx);
      return result;
    });
  } catch (err) {
    throwIfContactTaxIdConflict(err, input.taxId);
    throwIfContactChanged(err);
  }

  return updated;
}

export async function archiveContact(id: string, ctx: ServiceContext): Promise<Contact> {
  if (!can(ctx.roles, "EDIT", "DIRECTORY")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions to archive contacts");
  }
  await assertTenantModuleEnabled(ctx, "DIRECTORY");
  const contact = await prisma.contact.findUnique({ where: { id } });
  if (!contact) throw new ServiceError("NOT_FOUND", "Contacto no encontrado");
  if (contact.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (contact.status === "ARCHIVED") throw new ServiceError("CONFLICT", "El contacto ya está archivado");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.contact.update({
      where: { id, tenantId: ctx.tenantId, status: "ACTIVE", updatedAt: contact.updatedAt },
      data: { status: "ARCHIVED", updatedBy: ctx.actorUserId },
    });
    await log({
      tenantId: ctx.tenantId,
      actorUserId: ctx.actorUserId,
      action: "contact.archived",
      entityType: "Contact",
      entityId: id,
      ipAddress: ctx.ipAddress,
    }, tx);
    return updated;
  }).catch(throwIfContactChanged);
}

export async function reactivateContact(id: string, ctx: ServiceContext): Promise<Contact> {
  if (!can(ctx.roles, "EDIT", "DIRECTORY")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions to reactivate contacts");
  }
  await assertTenantModuleEnabled(ctx, "DIRECTORY");
  const contact = await prisma.contact.findUnique({ where: { id } });
  if (!contact) throw new ServiceError("NOT_FOUND", "Contacto no encontrado");
  if (contact.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (contact.status === "ACTIVE") throw new ServiceError("CONFLICT", "El contacto ya está activo");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.contact.update({
      where: { id, tenantId: ctx.tenantId, status: "ARCHIVED", updatedAt: contact.updatedAt },
      data: { status: "ACTIVE", updatedBy: ctx.actorUserId },
    });
    await log({
      tenantId: ctx.tenantId,
      actorUserId: ctx.actorUserId,
      action: "contact.reactivated",
      entityType: "Contact",
      entityId: id,
      ipAddress: ctx.ipAddress,
    }, tx);
    return updated;
  }).catch(throwIfContactChanged);
}

export async function assignContactRole(
  contactId: string,
  input: AssignContactRoleInput,
  ctx: ServiceContext,
): Promise<ContactRole> {
  if (!can(ctx.roles, "EDIT", "DIRECTORY")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions to assign roles");
  }
  await assertTenantModuleEnabled(ctx, "DIRECTORY");
  input = validateContactInput(assignContactRoleSchema, input);

  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) throw new ServiceError("NOT_FOUND", "Contacto no encontrado");
  if (contact.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (contact.status !== "ACTIVE") {
    throw new ServiceError("CONFLICT", "No se pueden asignar roles a un contacto archivado");
  }

  const existing = await prisma.contactRole.findUnique({
    where: { contactId_role: { contactId, role: input.role } },
  });
  if (existing && existing.tenantId !== ctx.tenantId) {
    throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  }

  let contactRole: ContactRole;

  try {
    contactRole = await prisma.$transaction(async (tx) => {
      const currentContact = await _lockDirectoryContact(tx, contactId, ctx.tenantId);
      if (currentContact.status !== "ACTIVE") {
        throw new ServiceError("CONFLICT", "No se pueden asignar roles a un contacto archivado");
      }
      const currentRole = await tx.contactRole.findUnique({ where: { contactId_role: { contactId, role: input.role } } });
      if (currentRole && currentRole.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
      let assigned: ContactRole;
      if (currentRole) {
        if (currentRole.status === "ACTIVE") {
          throw new ServiceError("CONFLICT", `El contacto ya tiene el rol ${ROLE_LABEL_ES[input.role]}`);
        }
        assigned = await tx.contactRole.update({
          where: { id: currentRole.id, tenantId: ctx.tenantId, status: "INACTIVE", updatedAt: currentRole.updatedAt },
          data: { status: "ACTIVE", notes: input.notes === undefined ? currentRole.notes : input.notes },
        });
      } else {
        assigned = await tx.contactRole.create({
          data: { contactId, tenantId: ctx.tenantId, role: input.role, notes: input.notes },
        });
      }
      await _createProfileIfNeeded(tx, contactId, input.role, input);
      await log({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId,
        action: currentRole ? "contact_role.reactivated" : "contact_role.assigned",
        entityType: "ContactRole",
        entityId: assigned.id,
        after: { role: input.role, contactId },
        ipAddress: ctx.ipAddress,
      }, tx);
      return assigned;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ServiceError("CONFLICT", `El contacto ya tiene el rol ${ROLE_LABEL_ES[input.role]}`);
    }
    throwIfContactChanged(err);
  }

  return contactRole;
}

export async function removeContactRole(
  contactId: string,
  role: ContactRoleType,
  ctx: ServiceContext,
): Promise<ContactRole> {
  if (!can(ctx.roles, "EDIT", "DIRECTORY")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions to remove roles");
  }
  await assertTenantModuleEnabled(ctx, "DIRECTORY");

  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) throw new ServiceError("NOT_FOUND", "Contacto no encontrado");
  if (contact.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const contactRole = await prisma.contactRole.findUnique({
    where: { contactId_role: { contactId, role } },
  });
  if (!contactRole || contactRole.status === "INACTIVE") {
    throw new ServiceError("NOT_FOUND", `El contacto no tiene el rol ${ROLE_LABEL_ES[role]} activo`);
  }
  if (contactRole.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  if (role === "CLIENT") await _assertNoLinkedClientProject(contactId, ctx.tenantId, prisma);

  return prisma.$transaction(async (tx) => {
    await _lockDirectoryContact(tx, contactId, ctx.tenantId);
    const currentRole = await tx.contactRole.findUnique({ where: { contactId_role: { contactId, role } } });
    if (!currentRole || currentRole.status === "INACTIVE") {
      throw new ServiceError("NOT_FOUND", `El contacto no tiene el rol ${ROLE_LABEL_ES[role]} activo`);
    }
    if (currentRole.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    if (role === "CLIENT") await _assertNoLinkedClientProject(contactId, ctx.tenantId, tx);
    const updated = await tx.contactRole.update({
      where: { id: currentRole.id, tenantId: ctx.tenantId, status: "ACTIVE", updatedAt: currentRole.updatedAt },
      data: { status: "INACTIVE" },
    });
    await log({
      tenantId: ctx.tenantId,
      actorUserId: ctx.actorUserId,
      action: "contact_role.removed",
      entityType: "ContactRole",
      entityId: currentRole.id,
      after: { role, contactId, status: "INACTIVE" },
      ipAddress: ctx.ipAddress,
    }, tx);
    return updated;
  }).catch(throwIfContactChanged);
}

// ─── Profile updates ──────────────────────────────────────────────────────────

async function _assertProfileEditAllowed(ctx: ServiceContext) {
  if (!can(ctx.roles, "EDIT", "DIRECTORY")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions to update profiles");
  }
  await assertTenantModuleEnabled(ctx, "DIRECTORY");
}

async function _guardContactForProfile(contactId: string, ctx: ServiceContext, tx: Prisma.TransactionClient) {
  const contact = await _lockDirectoryContact(tx, contactId, ctx.tenantId);
  if (contact.status !== "ACTIVE") {
    throw new ServiceError("CONFLICT", "No se puede editar el perfil de un contacto archivado");
  }
  return contact;
}

async function _requireActiveRole(
  contactId: string,
  role: ContactRoleType,
  tenantId: string,
  tx: Prisma.TransactionClient,
): Promise<void> {
  const contactRole = await tx.contactRole.findUnique({
    where: { contactId_role: { contactId, role } },
    select: { status: true, tenantId: true },
  });
  if (!contactRole || contactRole.tenantId !== tenantId || contactRole.status !== "ACTIVE") {
    throw new ServiceError("NOT_FOUND", `El contacto no tiene el rol ${ROLE_LABEL_ES[role]} activo`);
  }
}

export async function updateClientProfile(
  contactId: string,
  input: UpdateClientProfileInput,
  ctx: ServiceContext,
): Promise<ClientProfile> {
  await _assertProfileEditAllowed(ctx);
  input = validateContactInput(updateClientProfileSchema, input);
  return prisma.$transaction(async (tx) => {
    await _guardContactForProfile(contactId, ctx, tx);
    await _requireActiveRole(contactId, "CLIENT", ctx.tenantId, tx);
    const profile = await tx.clientProfile.findUnique({ where: { contactId } });
    const updated = profile
      ? await tx.clientProfile.update({ where: { contactId, updatedAt: profile.updatedAt }, data: input })
      : await tx.clientProfile.create({ data: { contactId, ...input } });
    await log({
      tenantId: ctx.tenantId,
      actorUserId: ctx.actorUserId,
      action: "client_profile.updated",
      entityType: "ClientProfile",
      entityId: updated.id,
      before: profile ? {
        paymentTermsDays: profile.paymentTermsDays,
        defaultCurrency: profile.defaultCurrency,
        creditLimit: profile.creditLimit == null ? null : serializeMoney(profile.creditLimit.toString()),
        notes: profile.notes,
      } : undefined,
      after: input,
      ipAddress: ctx.ipAddress,
    }, tx);
    return updated;
  }).catch(throwIfContactChanged);
}

export async function updateSupplierProfile(
  contactId: string,
  input: UpdateSupplierProfileInput,
  ctx: ServiceContext,
): Promise<SupplierProfile> {
  await _assertProfileEditAllowed(ctx);
  input = validateContactInput(updateSupplierProfileSchema, input);
  return prisma.$transaction(async (tx) => {
    await _guardContactForProfile(contactId, ctx, tx);
    await _requireActiveRole(contactId, "SUPPLIER", ctx.tenantId, tx);
    const profile = await tx.supplierProfile.findUnique({ where: { contactId } });
    const updated = profile
      ? await tx.supplierProfile.update({ where: { contactId, updatedAt: profile.updatedAt }, data: input })
      : await tx.supplierProfile.create({ data: { contactId, ...input } });
    await log({
      tenantId: ctx.tenantId,
      actorUserId: ctx.actorUserId,
      action: "supplier_profile.updated",
      entityType: "SupplierProfile",
      entityId: updated.id,
      before: profile ? {
        paymentTermsDays: profile.paymentTermsDays,
        defaultCurrency: profile.defaultCurrency,
        bankAccount: profile.bankAccount,
        notes: profile.notes,
      } : undefined,
      after: input,
      ipAddress: ctx.ipAddress,
    }, tx);
    return updated;
  }).catch(throwIfContactChanged);
}

export async function updateSubcontractorProfile(
  contactId: string,
  input: UpdateSubcontractorProfileInput,
  ctx: ServiceContext,
): Promise<SubcontractorProfile> {
  await _assertProfileEditAllowed(ctx);
  input = validateContactInput(updateSubcontractorProfileSchema, input);
  return prisma.$transaction(async (tx) => {
    await _guardContactForProfile(contactId, ctx, tx);
    await _requireActiveRole(contactId, "SUBCONTRACTOR", ctx.tenantId, tx);
    const profile = await tx.subcontractorProfile.findUnique({ where: { contactId } });
    const updated = profile
      ? await tx.subcontractorProfile.update({ where: { contactId, updatedAt: profile.updatedAt }, data: input })
      : await tx.subcontractorProfile.create({ data: { contactId, ...input } });
    await log({
      tenantId: ctx.tenantId,
      actorUserId: ctx.actorUserId,
      action: "subcontractor_profile.updated",
      entityType: "SubcontractorProfile",
      entityId: updated.id,
      before: profile ? { specialty: profile.specialty, notes: profile.notes } : undefined,
      after: input,
      ipAddress: ctx.ipAddress,
    }, tx);
    return updated;
  }).catch(throwIfContactChanged);
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function _lockDirectoryContact(tx: Prisma.TransactionClient, contactId: string, tenantId: string): Promise<Contact> {
  await lockContactForMutation(tx, contactId, tenantId);
  const contact = await tx.contact.findUnique({ where: { id: contactId } });
  if (!contact) throw new ServiceError("NOT_FOUND", "Contacto no encontrado");
  if (contact.tenantId !== tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  return contact;
}

async function _assertNoLinkedClientProject(contactId: string, tenantId: string, db: Prisma.TransactionClient): Promise<void> {
  const linkedProject = await db.project.findFirst({
    where: { tenantId, clientContactId: contactId, status: { notIn: ["COMPLETED", "CANCELLED"] } },
    select: { id: true, code: true },
  });
  if (linkedProject) {
    throw new ServiceError("CONFLICT", `No se puede quitar el rol cliente: el contacto es cliente del proyecto ${linkedProject.code}. Reasigná el cliente primero.`);
  }
}

async function _createProfileIfNeeded(
  tx: Prisma.TransactionClient,
  contactId: string,
  role: ContactRoleType,
  input: Partial<AssignContactRoleInput>,
) {
  if (role === "CLIENT") {
    await tx.clientProfile.upsert({
      where: { contactId },
      update: {},
      create: {
        contactId,
        paymentTermsDays: input.paymentTermsDays ?? 0,
        defaultCurrency: input.defaultCurrency ?? "ARS",
        creditLimit: input.creditLimit ?? undefined,
      },
    });
  } else if (role === "SUPPLIER") {
    await tx.supplierProfile.upsert({
      where: { contactId },
      update: {},
      create: {
        contactId,
        paymentTermsDays: input.paymentTermsDays ?? 0,
        defaultCurrency: input.defaultCurrency ?? "ARS",
        bankAccount: input.bankAccount,
      },
    });
  } else if (role === "SUBCONTRACTOR") {
    await tx.subcontractorProfile.upsert({
      where: { contactId },
      update: {},
      create: {
        contactId,
        specialty: input.specialty,
      },
    });
  }
}
