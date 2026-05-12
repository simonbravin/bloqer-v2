import { can } from "@bloqer/domain";
import type { UserRole } from "@bloqer/domain";

/** Hub + equipo + permisos lectura. */
export function canReadTenantConfigArea(roles: UserRole[]): boolean {
  return can(roles, "VIEW", "TENANT_SETTINGS") || can(roles, "VIEW", "USERS_PERMISSIONS");
}

export function canEditTenantDisplaySettings(roles: UserRole[]): boolean {
  return can(roles, "EDIT", "TENANT_SETTINGS");
}

export function canEditTeamMembership(roles: UserRole[]): boolean {
  return can(roles, "EDIT", "USERS_PERMISSIONS");
}
