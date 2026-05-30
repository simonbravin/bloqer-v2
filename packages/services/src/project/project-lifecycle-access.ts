import { can, canManageProjectLifecycleAdmin, type UserRole } from "@bloqer/domain";

export function canCancelActiveProject(roles: UserRole[]): boolean {
  return canManageProjectLifecycleAdmin(roles);
}

export function canReactivateProject(roles: UserRole[]): boolean {
  return canManageProjectLifecycleAdmin(roles);
}

export function canCancelDraftProject(roles: UserRole[]): boolean {
  return can(roles, "EDIT", "PROJECTS");
}

/** Preview de impacto / estado destino al cancelar o reactivar. */
export function canViewProjectCancellationImpact(roles: UserRole[]): boolean {
  return (
    can(roles, "VIEW", "PROJECTS") ||
    canCancelActiveProject(roles) ||
    canReactivateProject(roles) ||
    canCancelDraftProject(roles)
  );
}
