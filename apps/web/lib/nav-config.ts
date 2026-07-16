import { can } from "@bloqer/domain";
import type { UserRole } from "@bloqer/domain";
import type { PermissionAction, PermissionModule } from "@bloqer/domain";

/** Leaf requirement: single can() check */
export type NavLeaf = { action: PermissionAction; module: PermissionModule };

/** Composite: any branch must pass */
export type NavRequirement = NavLeaf | { anyOf: NavRequirement[] };

/**
 * Role permission AND tenant module enabled for each leaf in the requirement tree.
 * Used by `global-workspace-nav` (shell) — not a legacy MAIN_NAV list.
 */
export function satisfiesNavRequirement(
  roles: UserRole[],
  req: NavRequirement,
  isTenantModuleEnabled: (module: PermissionModule) => boolean,
): boolean {
  if ("anyOf" in req) {
    return req.anyOf.some((r) => satisfiesNavRequirement(roles, r, isTenantModuleEnabled));
  }
  return can(roles, req.action, req.module) && isTenantModuleEnabled(req.module);
}
