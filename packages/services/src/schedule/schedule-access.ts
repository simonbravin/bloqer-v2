import { can, type UserRole } from "@bloqer/domain";

export function canViewScheduleArea(roles: UserRole[]): boolean {
  return can(roles, "VIEW", "SCHEDULE") || can(roles, "VIEW", "PROJECTS");
}

export function canEditScheduleArea(roles: UserRole[]): boolean {
  return can(roles, "EDIT", "SCHEDULE");
}

/**
 * Decide whether ensureScheduleForProject may create a row.
 * Existing schedule → reuse; missing + VIEW-only → forbid create; missing + EDIT → create.
 */
export function resolveEnsureScheduleCreatePolicy(
  scheduleExists: boolean,
  roles: UserRole[],
): "reuse" | "create" | "forbid_create" {
  if (scheduleExists) return "reuse";
  if (!canEditScheduleArea(roles)) return "forbid_create";
  return "create";
}
