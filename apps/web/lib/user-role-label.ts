import { USER_ROLE_LABEL_ES, type UserRole } from "@bloqer/domain";

/** e.g. `PROJECT_MANAGER (Jefe de obra)`. */
export function formatUserRoleLabel(role: string): string {
  if (!Object.hasOwn(USER_ROLE_LABEL_ES, role)) return role;
  return `${role} (${USER_ROLE_LABEL_ES[role as UserRole]})`;
}

export function formatUserRoleList(roles: readonly string[]): string {
  if (roles.length === 0) return "—";
  return roles.map(formatUserRoleLabel).join(", ");
}
