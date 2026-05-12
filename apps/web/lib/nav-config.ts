import { can } from "@bloqer/domain";
import type { UserRole } from "@bloqer/domain";
import type { PermissionAction, PermissionModule } from "@bloqer/domain";

/** Leaf requirement: single can() check */
type NavLeaf = { action: PermissionAction; module: PermissionModule };

/** Composite: any branch must pass */
type NavRequirement = NavLeaf | { anyOf: NavRequirement[] };

/** Phase 12B: role permission AND tenant module enabled for each leaf in the requirement tree. */
function satisfiesWithTenantModules(
  roles: UserRole[],
  req: NavRequirement,
  isTenantModuleEnabled: (module: PermissionModule) => boolean,
): boolean {
  if ("anyOf" in req) {
    return req.anyOf.some((r) => satisfiesWithTenantModules(roles, r, isTenantModuleEnabled));
  }
  return can(roles, req.action, req.module) && isTenantModuleEnabled(req.module);
}

export type FilterMainNavOptions = {
  /** If omitted, all tenant modules are treated as enabled (backward compatible). */
  isTenantModuleEnabled?: (module: PermissionModule) => boolean;
};

export type MainNavItemDef = {
  href:  string;
  label: string;
  /** If set, item is shown only when this passes */
  require?: NavRequirement;
};

/**
 * Top-level shell navigation. Filter with `filterMainNav(roles, options?)`.
 * Uses real `PermissionModule` keys from `@bloqer/domain` (see PERMISSIONS_MATRIX.md).
 *
 * Phase 12A: Project-scoped modules (certifications, procurement, AR/AP detail, etc.)
 * live under `/proyectos/[id]/…` — gated there via services + `VIEW PROJECTS` / module-specific `can()`, not listed here.
 *
 * Phase 12B: Pass `isTenantModuleEnabled` from `getTenantModuleGate` so nav respects tenant module toggles.
 */
export const MAIN_NAV_DEF: MainNavItemDef[] = [
  { href: "/dashboard", label: "Inicio" },
  { href: "/proyectos", label: "Proyectos", require: { action: "VIEW", module: "PROJECTS" } },
  { href: "/directorio", label: "Directorio", require: { action: "VIEW", module: "DIRECTORY" } },
  { href: "/inventario", label: "Inventario", require: { action: "VIEW", module: "INVENTORY" } },
  { href: "/tesoreria", label: "Tesorería", require: { action: "VIEW", module: "TREASURY" } },
  { href: "/contabilidad", label: "Contabilidad", require: { action: "VIEW", module: "ACCOUNTING" } },
  {
    href:  "/finanzas",
    label: "Finanzas",
    require: { anyOf: [{ action: "VIEW", module: "AR" }, { action: "VIEW", module: "AP" }] },
  },
  {
    href: "/configuracion",
    label: "Configuración",
    require: {
      anyOf: [{ action: "VIEW", module: "TENANT_SETTINGS" }, { action: "VIEW", module: "USERS_PERMISSIONS" }],
    },
  },
];

export function filterMainNav(
  roles: UserRole[],
  options?: FilterMainNavOptions,
): Array<{ href: string; label: string }> {
  const modOk = options?.isTenantModuleEnabled ?? (() => true);
  return MAIN_NAV_DEF.filter((item) => {
    if (!item.require) return true;
    return satisfiesWithTenantModules(roles, item.require, modOk);
  }).map(({ href, label }) => ({ href, label }));
}
