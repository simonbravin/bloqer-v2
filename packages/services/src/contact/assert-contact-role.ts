import { prisma, type ContactRoleType } from "@bloqer/database";
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

/** Load contact + role and reject cross-tenant or inactive role. */
export async function assertContactRoleInTenant(
  contactId: string,
  roleType: ContactRoleType,
  tenantId: string,
  opts?: { contactNotFoundMessage?: string },
): Promise<void> {
  const [contact, role] = await Promise.all([
    prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, tenantId: true, status: true },
    }),
    prisma.contactRole.findUnique({
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
