import type { UserRole as PrismaUserRole } from "@bloqer/database";
import { ServiceError } from "../types";

/**
 * Simulates active OWNER count after applying new roles to one membership.
 * If the tenant has no active OWNER before the change (data anomaly), the mutation is not blocked.
 */
export function assertStillHasActiveOwnerAfterRoleChange(
  membershipId: string,
  newRoles: PrismaUserRole[],
  existingActiveRows: { id: string; roles: PrismaUserRole[] }[],
): void {
  const ownersBefore = existingActiveRows.filter((m) => m.roles.some((r) => r === "OWNER")).length;
  let ownersAfter = 0;
  for (const row of existingActiveRows) {
    const eff = row.id === membershipId ? newRoles : row.roles;
    if (eff.some((r) => r === "OWNER")) ownersAfter += 1;
  }
  if (ownersBefore >= 1 && ownersAfter < 1) {
    throw new ServiceError(
      "CONFLICT",
      "No se puede dejar al tenant sin al menos un miembro activo con rol OWNER",
    );
  }
}

/** After deactivating `membershipId`, tenant must still have an active OWNER if it had one before. */
export function assertStillHasActiveOwnerAfterDeactivate(
  existingActiveRows: { id: string; roles: PrismaUserRole[] }[],
  membershipId: string,
): void {
  const ownersBefore = existingActiveRows.filter((m) => m.roles.some((r) => r === "OWNER")).length;
  let ownersAfter = 0;
  for (const row of existingActiveRows) {
    if (row.id === membershipId) continue;
    if (row.roles.some((r) => r === "OWNER")) ownersAfter += 1;
  }
  if (ownersBefore >= 1 && ownersAfter < 1) {
    throw new ServiceError(
      "CONFLICT",
      "No se puede desactivar al único miembro activo con rol OWNER del tenant",
    );
  }
}
