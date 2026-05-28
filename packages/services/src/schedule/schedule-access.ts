import { can, type UserRole } from "@bloqer/domain";

export function canViewScheduleArea(roles: UserRole[]): boolean {
  return can(roles, "VIEW", "SCHEDULE") || can(roles, "VIEW", "PROJECTS");
}

export function canEditScheduleArea(roles: UserRole[]): boolean {
  return can(roles, "EDIT", "SCHEDULE");
}
