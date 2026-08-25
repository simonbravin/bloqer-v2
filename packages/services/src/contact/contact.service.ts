import { prisma, Prisma } from "@bloqer/database";
import type { Contact, ContactRole, ContactRoleType } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type {
  CreateContactInput,
  UpdateContactInput,
  AssignContactRoleInput,
  ListContactsInput,
  UpdateClientProfileInput,
  UpdateSupplierProfileInput,
  UpdateSubcontractorProfileInput,
} from "@bloqer/validators";
import type { ClientProfile, SupplierProfile, SubcontractorProfile } from "@bloqer/database";
import { log } from "../audit/audit.service";
import { ServiceContext, ServiceError } from "../types";

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
  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      roles: { orderBy: [{ status: "asc" }, { role: "asc" }] },
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

  const search = filters.search?.trim();
  const rawPage = filters.page;
  const page =
    rawPage != null && Number.isFinite(rawPage) ? Math.max(1, Math.trunc(rawPage)) : 1;
  const rawPageSize = filters.pageSize;
  const pageSize =
    rawPageSize != null && Number.isFinite(rawPageSize)
      ? Math.min(200, Math.max(1, Math.trunc(rawPageSize)))
      : 20;

  const where: Prisma.ContactWhereInput = {
    tenantId: ctx.tenantId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(search
      ? {
          OR: [
            { legalName: { contains: search, mode: "insensitive" } },
            { fantasyName: { contains: search, mode: "insensitive" } },
            { taxId: { contains: search } },
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
        roles: { where: { status: "ACTIVE" }, orderBy: { role: "asc" } },
        clientProfile: true,
        supplierProfile: true,
        subcontractorProfile: true,
      },
      orderBy: { legalName: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.contact.count({ where }),
  ]);

  return { data, total };
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createContact(
  input: CreateContactInput,
  ctx: ServiceContext,
): Promise<ContactWithRoles> {
  if (!can(ctx.roles, "EDIT", "DIRECTORY")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions to create contacts");
  }

  if (input.taxId) {
    const existing = await prisma.contact.findUnique({
      where: { tenantId_taxId: { tenantId: ctx.tenantId, taxId: input.taxId } },
    });
    if (existing) throw new ServiceError("CONFLICT", `Ya existe un contacto con ese CUIT/CUIL (${input.taxId})`);
  }

  const { initialRole, ...contactData } = input;
  if (!initialRole) {
    throw new ServiceError("VALIDATION", "Elegí un rol");
  }

  let contact: ContactWithRoles;
  try {
    contact = await prisma.$transaction(async (tx) => {
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

      return tx.contact.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          roles: { where: { status: "ACTIVE" }, orderBy: { role: "asc" } },
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

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "contact.created",
    entityType: "Contact",
    entityId: contact.id,
    after: { legalName: contact.legalName, taxId: contact.taxId, initialRole },
    ipAddress: ctx.ipAddress,
  });

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

  const existing = await prisma.contact.findUnique({ where: { id } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Contacto no encontrado");
  if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  if (input.taxId && input.taxId !== existing.taxId) {
    const conflict = await prisma.contact.findUnique({
      where: { tenantId_taxId: { tenantId: ctx.tenantId, taxId: input.taxId } },
    });
    if (conflict) throw new ServiceError("CONFLICT", `Ya existe un contacto con ese CUIT/CUIL (${input.taxId})`);
  }

  let updated: ContactWithRoles;
  try {
    updated = await prisma.contact.update({
      where: { id },
      data: { ...input, updatedBy: ctx.actorUserId },
      include: {
        roles: { where: { status: "ACTIVE" }, orderBy: { role: "asc" } },
        clientProfile: true,
        supplierProfile: true,
        subcontractorProfile: true,
      },
    });
  } catch (err) {
    throwIfContactTaxIdConflict(err, input.taxId);
    throw err;
  }

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "contact.updated",
    entityType: "Contact",
    entityId: id,
    before: { legalName: existing.legalName, taxId: existing.taxId },
    after: { legalName: updated.legalName, taxId: updated.taxId },
    ipAddress: ctx.ipAddress,
  });

  return updated;
}

export async function archiveContact(id: string, ctx: ServiceContext): Promise<Contact> {
  if (!can(ctx.roles, "EDIT", "DIRECTORY")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions to archive contacts");
  }
  const contact = await prisma.contact.findUnique({ where: { id } });
  if (!contact) throw new ServiceError("NOT_FOUND", "Contacto no encontrado");
  if (contact.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (contact.status === "ARCHIVED") throw new ServiceError("CONFLICT", "El contacto ya está archivado");

  const updated = await prisma.contact.update({
    where: { id },
    data: { status: "ARCHIVED", updatedBy: ctx.actorUserId },
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "contact.archived",
    entityType: "Contact",
    entityId: id,
    ipAddress: ctx.ipAddress,
  });

  return updated;
}

export async function reactivateContact(id: string, ctx: ServiceContext): Promise<Contact> {
  if (!can(ctx.roles, "EDIT", "DIRECTORY")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions to reactivate contacts");
  }
  const contact = await prisma.contact.findUnique({ where: { id } });
  if (!contact) throw new ServiceError("NOT_FOUND", "Contacto no encontrado");
  if (contact.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (contact.status === "ACTIVE") throw new ServiceError("CONFLICT", "El contacto ya está activo");

  const updated = await prisma.contact.update({
    where: { id },
    data: { status: "ACTIVE", updatedBy: ctx.actorUserId },
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "contact.reactivated",
    entityType: "Contact",
    entityId: id,
    ipAddress: ctx.ipAddress,
  });

  return updated;
}

export async function assignContactRole(
  contactId: string,
  input: AssignContactRoleInput,
  ctx: ServiceContext,
): Promise<ContactRole> {
  if (!can(ctx.roles, "EDIT", "DIRECTORY")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions to assign roles");
  }

  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) throw new ServiceError("NOT_FOUND", "Contacto no encontrado");
  if (contact.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const existing = await prisma.contactRole.findUnique({
    where: { contactId_role: { contactId, role: input.role } },
  });

  let contactRole: ContactRole;
  let action: "contact_role.reactivated" | "contact_role.assigned";

  try {
    contactRole = await prisma.$transaction(async (tx) => {
      if (existing) {
        if (existing.status === "ACTIVE") {
          throw new ServiceError("CONFLICT", `El contacto ya tiene el rol ${ROLE_LABEL_ES[input.role]}`);
        }
        const reactivated = await tx.contactRole.update({
          where: { id: existing.id },
          data: { status: "ACTIVE", notes: input.notes ?? existing.notes },
        });
        await _createProfileIfNeeded(tx, contactId, input.role, input);
        return reactivated;
      }
      const created = await tx.contactRole.create({
        data: { contactId, tenantId: ctx.tenantId, role: input.role, notes: input.notes },
      });
      await _createProfileIfNeeded(tx, contactId, input.role, input);
      return created;
    });
    action = existing ? "contact_role.reactivated" : "contact_role.assigned";
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ServiceError("CONFLICT", `El contacto ya tiene el rol ${ROLE_LABEL_ES[input.role]}`);
    }
    throw err;
  }

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action,
    entityType: "ContactRole",
    entityId: contactRole.id,
    after: { role: input.role, contactId },
    ipAddress: ctx.ipAddress,
  });

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

  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) throw new ServiceError("NOT_FOUND", "Contacto no encontrado");
  if (contact.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const contactRole = await prisma.contactRole.findUnique({
    where: { contactId_role: { contactId, role } },
  });
  if (!contactRole || contactRole.status === "INACTIVE") {
    throw new ServiceError("NOT_FOUND", `El contacto no tiene el rol ${role} activo`);
  }

  // BR-PROJ-001: project client must keep an active CLIENT role.
  if (role === "CLIENT") {
    const linkedProject = await prisma.project.findFirst({
      where: {
        tenantId: ctx.tenantId,
        clientContactId: contactId,
        status: { not: "CANCELLED" },
      },
      select: { id: true, code: true },
    });
    if (linkedProject) {
      throw new ServiceError(
        "CONFLICT",
        `No se puede quitar el rol cliente: el contacto es cliente del proyecto ${linkedProject.code}. Reasigná el cliente primero.`,
      );
    }
  }

  const updated = await prisma.contactRole.update({
    where: { id: contactRole.id },
    data: { status: "INACTIVE" },
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "contact_role.removed",
    entityType: "ContactRole",
    entityId: contactRole.id,
    after: { role, contactId, status: "INACTIVE" },
    ipAddress: ctx.ipAddress,
  });

  return updated;
}

// ─── Profile updates ──────────────────────────────────────────────────────────

async function _guardContactForProfile(contactId: string, ctx: ServiceContext) {
  if (!can(ctx.roles, "EDIT", "DIRECTORY")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions to update profiles");
  }
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) throw new ServiceError("NOT_FOUND", "Contacto no encontrado");
  if (contact.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  return contact;
}

async function _requireActiveRole(
  contactId: string,
  role: ContactRoleType,
  tenantId: string,
): Promise<void> {
  const contactRole = await prisma.contactRole.findUnique({
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
  await _guardContactForProfile(contactId, ctx);
  let profile = await prisma.clientProfile.findUnique({ where: { contactId } });
  if (!profile) {
    await _requireActiveRole(contactId, "CLIENT", ctx.tenantId);
    profile = await prisma.clientProfile.create({
      data: { contactId, paymentTermsDays: 0, defaultCurrency: "ARS" },
    });
  }

  const updated = await prisma.clientProfile.update({
    where: { contactId },
    data: input,
  });
  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "client_profile.updated",
    entityType: "ClientProfile",
    entityId: profile.id,
    before: { paymentTermsDays: profile.paymentTermsDays, defaultCurrency: profile.defaultCurrency },
    after: input,
    ipAddress: ctx.ipAddress,
  });
  return updated;
}

export async function updateSupplierProfile(
  contactId: string,
  input: UpdateSupplierProfileInput,
  ctx: ServiceContext,
): Promise<SupplierProfile> {
  await _guardContactForProfile(contactId, ctx);
  let profile = await prisma.supplierProfile.findUnique({ where: { contactId } });
  if (!profile) {
    await _requireActiveRole(contactId, "SUPPLIER", ctx.tenantId);
    profile = await prisma.supplierProfile.create({
      data: { contactId, paymentTermsDays: 0, defaultCurrency: "ARS" },
    });
  }

  const updated = await prisma.supplierProfile.update({
    where: { contactId },
    data: input,
  });
  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "supplier_profile.updated",
    entityType: "SupplierProfile",
    entityId: profile.id,
    before: { paymentTermsDays: profile.paymentTermsDays, defaultCurrency: profile.defaultCurrency },
    after: input,
    ipAddress: ctx.ipAddress,
  });
  return updated;
}

export async function updateSubcontractorProfile(
  contactId: string,
  input: UpdateSubcontractorProfileInput,
  ctx: ServiceContext,
): Promise<SubcontractorProfile> {
  await _guardContactForProfile(contactId, ctx);
  let profile = await prisma.subcontractorProfile.findUnique({ where: { contactId } });
  if (!profile) {
    await _requireActiveRole(contactId, "SUBCONTRACTOR", ctx.tenantId);
    profile = await prisma.subcontractorProfile.create({
      data: { contactId },
    });
  }

  const updated = await prisma.subcontractorProfile.update({
    where: { contactId },
    data: input,
  });
  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "subcontractor_profile.updated",
    entityType: "SubcontractorProfile",
    entityId: profile.id,
    before: { specialty: profile.specialty },
    after: input,
    ipAddress: ctx.ipAddress,
  });
  return updated;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function _createProfileIfNeeded(
  tx: Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">,
  contactId: string,
  role: ContactRoleType,
  input: Partial<AssignContactRoleInput>,
) {
  if (role === "CLIENT") {
    const exists = await tx.clientProfile.findUnique({ where: { contactId } });
    if (!exists) {
      await tx.clientProfile.create({
        data: {
          contactId,
          paymentTermsDays: input.paymentTermsDays ?? 0,
          defaultCurrency: input.defaultCurrency ?? "ARS",
          creditLimit: input.creditLimit ?? undefined,
        },
      });
    }
  } else if (role === "SUPPLIER") {
    const exists = await tx.supplierProfile.findUnique({ where: { contactId } });
    if (!exists) {
      await tx.supplierProfile.create({
        data: {
          contactId,
          paymentTermsDays: input.paymentTermsDays ?? 0,
          defaultCurrency: input.defaultCurrency ?? "ARS",
          bankAccount: input.bankAccount,
        },
      });
    }
  } else if (role === "SUBCONTRACTOR") {
    const exists = await tx.subcontractorProfile.findUnique({ where: { contactId } });
    if (!exists) {
      await tx.subcontractorProfile.create({
        data: {
          contactId,
          specialty: input.specialty,
        },
      });
    }
  }
}
