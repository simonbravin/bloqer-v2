import { prisma } from "@bloqer/database";
import type { Contact, ContactRole, ContactRoleType, Prisma } from "@bloqer/database";
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

  const where: Prisma.ContactWhereInput = {
    tenantId: ctx.tenantId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.search
      ? {
          OR: [
            { legalName: { contains: filters.search, mode: "insensitive" } },
            { fantasyName: { contains: filters.search, mode: "insensitive" } },
            { taxId: { contains: filters.search } },
          ],
        }
      : {}),
    ...(filters.role
      ? { roles: { some: { role: filters.role, status: "ACTIVE" } } }
      : {}),
  };

  const [data, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      include: {
        roles: { where: { status: "ACTIVE" } },
        clientProfile: true,
        supplierProfile: true,
        subcontractorProfile: true,
      },
      orderBy: { legalName: "asc" },
      skip: ((filters.page ?? 1) - 1) * (filters.pageSize ?? 20),
      take: filters.pageSize ?? 20,
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

  const contact = await prisma.$transaction(async (tx) => {
    const created = await tx.contact.create({
      data: {
        ...contactData,
        tenantId: ctx.tenantId,
        createdBy: ctx.actorUserId,
        updatedBy: ctx.actorUserId,
      },
    });

    if (initialRole) {
      await tx.contactRole.create({
        data: { contactId: created.id, tenantId: ctx.tenantId, role: initialRole },
      });
      await _createProfileIfNeeded(tx, created.id, initialRole, {});
    }

    return tx.contact.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        roles: { where: { status: "ACTIVE" } },
        clientProfile: true,
        supplierProfile: true,
        subcontractorProfile: true,
      },
    });
  });

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

  const updated = await prisma.contact.update({
    where: { id },
    data: { ...input, updatedBy: ctx.actorUserId },
    include: {
      roles: { where: { status: "ACTIVE" } },
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

  if (existing) {
    if (existing.status === "ACTIVE") {
      throw new ServiceError("CONFLICT", `El contacto ya tiene el rol ${input.role}`);
    }
    // Reactivate
    contactRole = await prisma.contactRole.update({
      where: { id: existing.id },
      data: { status: "ACTIVE", notes: input.notes ?? existing.notes },
    });
    await log({
      tenantId: ctx.tenantId,
      actorUserId: ctx.actorUserId,
      action: "contact_role.reactivated",
      entityType: "ContactRole",
      entityId: contactRole.id,
      after: { role: input.role, contactId },
      ipAddress: ctx.ipAddress,
    });
  } else {
    contactRole = await prisma.contactRole.create({
      data: { contactId, tenantId: ctx.tenantId, role: input.role, notes: input.notes },
    });
    await log({
      tenantId: ctx.tenantId,
      actorUserId: ctx.actorUserId,
      action: "contact_role.assigned",
      entityType: "ContactRole",
      entityId: contactRole.id,
      after: { role: input.role, contactId },
      ipAddress: ctx.ipAddress,
    });
  }

  // Create profile if not exists
  await _createProfileIfNeeded(prisma, contactId, input.role, input);

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

export async function updateClientProfile(
  contactId: string,
  input: UpdateClientProfileInput,
  ctx: ServiceContext,
): Promise<ClientProfile> {
  await _guardContactForProfile(contactId, ctx);
  const profile = await prisma.clientProfile.findUnique({ where: { contactId } });
  if (!profile) throw new ServiceError("NOT_FOUND", "Perfil de cliente no encontrado");

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
  const profile = await prisma.supplierProfile.findUnique({ where: { contactId } });
  if (!profile) throw new ServiceError("NOT_FOUND", "Perfil de proveedor no encontrado");

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
  const profile = await prisma.subcontractorProfile.findUnique({ where: { contactId } });
  if (!profile) throw new ServiceError("NOT_FOUND", "Perfil de subcontratista no encontrado");

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
