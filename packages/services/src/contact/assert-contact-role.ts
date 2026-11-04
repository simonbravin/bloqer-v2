import { prisma, type ContactRoleType, type Prisma } from "@bloqer/database";
import { ServiceError } from "../types";

const ROLE_LABEL_ES: Record<ContactRoleType, string> = {
  CLIENT: "cliente",
  SUPPLIER: "proveedor",
  SUBCONTRACTOR: "subcontratista",
  EMPLOYEE: "empleado",
  OTHER: "otro",
};

/**
 * Pure tenant/role gate for contacts used in mutations.
 * Used by assertContactRoleInTenant and unit-tested without DB.
 */
export function assertContactRoleMatchesTenant(params: {
  contact: { tenantId: string; status: string } | null | undefined;
  role: { tenantId: string; status: string } | null | undefined;
  ctxTenantId: string;
  roleType: ContactRoleType;
  contactNotFoundMessage?: string;
}): void {
  const label = ROLE_LABEL_ES[params.roleType];
  if (!params.contact || params.contact.tenantId !== params.ctxTenantId) {
    throw new ServiceError(
      "NOT_FOUND",
      params.contactNotFoundMessage ?? `Contacto ${label} no encontrado`,
    );
  }
  if (params.contact.status !== "ACTIVE") {
    throw new ServiceError("CONFLICT", `El contacto ${label} seleccionado no está activo`);
  }
  if (
    !params.role ||
    params.role.tenantId !== params.ctxTenantId ||
    params.role.status !== "ACTIVE"
  ) {
    throw new ServiceError(
      "CONFLICT",
      `El contacto seleccionado no tiene rol de ${label} activo`,
    );
  }
}

/** Roles accepted as payee on AP without a purchase order ([D-089] / BR-AP-001). */
export const AP_DIRECT_PAYEE_ROLES: ContactRoleType[] = ["SUPPLIER", "EMPLOYEE"];

export function assertContactHasAnyMatchingRole(params: {
  contact: { tenantId: string; status: string } | null | undefined;
  matchingRole: { tenantId: string; status: string } | null | undefined;
  ctxTenantId: string;
  allowedRoleTypes: ContactRoleType[];
}): void {
  if (params.allowedRoleTypes.length === 0) {
    throw new ServiceError("VALIDATION", "Se requiere al menos un rol de contacto");
  }
  if (!params.contact || params.contact.tenantId !== params.ctxTenantId) {
    throw new ServiceError("NOT_FOUND", "Contacto no encontrado");
  }
  if (params.contact.status !== "ACTIVE") {
    throw new ServiceError("CONFLICT", "El contacto seleccionado no está activo");
  }
  if (
    !params.matchingRole ||
    params.matchingRole.tenantId !== params.ctxTenantId ||
    params.matchingRole.status !== "ACTIVE"
  ) {
    const labels = params.allowedRoleTypes.map((r) => ROLE_LABEL_ES[r]).join(" o ");
    throw new ServiceError(
      "CONFLICT",
      `El contacto seleccionado no tiene rol de ${labels} activo`,
    );
  }
}

export async function assertContactHasAnyRoleInTenant(
  contactId: string,
  roleTypes: ContactRoleType[],
  tenantId: string,
): Promise<void> {
  if (roleTypes.length === 0) {
    throw new ServiceError("VALIDATION", "Se requiere al menos un rol de contacto");
  }
  const [contact, matchingRole] = await Promise.all([
    prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, tenantId: true, status: true },
    }),
    prisma.contactRole.findFirst({
      where: { contactId, tenantId, role: { in: roleTypes }, status: "ACTIVE" },
      select: { tenantId: true, status: true },
    }),
  ]);
  assertContactHasAnyMatchingRole({
    contact,
    matchingRole,
    ctxTenantId: tenantId,
    allowedRoleTypes: roleTypes,
  });
}

/** Payee gate for SupplierInvoice / AP expense ([D-089]). */
export async function assertApInvoicePayee(
  contactId: string,
  tenantId: string,
  opts: { linkedToPurchaseOrder: boolean },
): Promise<void> {
  if (opts.linkedToPurchaseOrder) {
    await assertContactRoleInTenant(contactId, "SUPPLIER", tenantId);
    return;
  }
  await assertContactHasAnyRoleInTenant(contactId, AP_DIRECT_PAYEE_ROLES, tenantId);
}

/** Shared parent lock for Contact role/profile edits and transactional consumers. */
export async function lockContactForMutation(
  tx: Prisma.TransactionClient,
  contactId: string,
  tenantId: string,
): Promise<void> {
  // Serialize role/profile changes with consumers that validate the role inside
  // their write transaction. NO KEY UPDATE permits FK checks on the parent.
  await tx.$queryRaw`SELECT id FROM contacts WHERE id = ${contactId} AND "tenantId" = ${tenantId} FOR NO KEY UPDATE`;
}

/** Load contact + role and reject cross-tenant or inactive role. */
export async function assertContactRoleInTenant(
  contactId: string,
  roleType: ContactRoleType,
  tenantId: string,
  opts?: { contactNotFoundMessage?: string; tx?: Prisma.TransactionClient },
): Promise<void> {
  if (opts?.tx) await lockContactForMutation(opts.tx, contactId, tenantId);
  const db = opts?.tx ?? prisma;
  const [contact, role] = await Promise.all([
    db.contact.findUnique({
      where: { id: contactId },
      select: { id: true, tenantId: true, status: true },
    }),
    db.contactRole.findUnique({
      where: { contactId_role: { contactId, role: roleType } },
      select: { tenantId: true, status: true },
    }),
  ]);
  assertContactRoleMatchesTenant({
    contact,
    role,
    ctxTenantId: tenantId,
    roleType,
    contactNotFoundMessage: opts?.contactNotFoundMessage,
  });
}
