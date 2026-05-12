import type { UserRole } from "./roles";
import type { PermissionAction, PermissionModule } from "./matrix";
import { can } from "./matrix";

/** Row order for read-only permission matrix UI (`/configuracion/permisos`). Phase 12A: matches tenant RBAC roles in production matrix. */
export const OVERVIEW_ROLES: readonly UserRole[] = [
  "OWNER",
  "ADMIN",
  "FINANCE",
  "PROCUREMENT",
  "WAREHOUSE",
  "SALES",
  "VIEWER",
  "PROJECT_MANAGER",
  "SITE_FOREMAN",
  "PROJECT_VIEWER",
] as const;

/** Column order — must list every `PermissionModule` from `matrix.ts` (Phase 12A: keep in sync when adding modules). */
export const OVERVIEW_MODULES: readonly PermissionModule[] = [
  "DIRECTORY",
  "CLIENTS",
  "SUPPLIERS",
  "SUBCONTRACTORS",
  "PROJECTS",
  "SCHEDULE",
  "BUDGETS",
  "WBS",
  "CONTRACTS",
  "CHANGE_ORDERS",
  "RFIS",
  "JOBSITE_LOG",
  "CERTIFICATIONS",
  "PROCUREMENT",
  "PURCHASE_ORDERS",
  "SUBCONTRACTS",
  "INVENTORY",
  "WAREHOUSES",
  "DOCUMENTS",
  "NOTIFICATIONS",
  "TREASURY",
  "BANK_ACCOUNTS",
  "BANK_RECONCILIATION",
  "EXPENSES_PAYMENTS",
  "INTERNAL_TRANSFERS",
  "AR",
  "AP",
  "TAXES",
  "PERIOD_CLOSE",
  "ACCOUNTING",
  "USERS_PERMISSIONS",
  "TENANT_SETTINGS",
  "MASTER_DATA",
  "AUDIT",
  "BILLING",
  "TENANT_TRANSFER",
  "CONSOLIDATED_NET_PROFITABILITY",
] as const;

/** Highest action a single-role user effectively has on a module (includes hard rules via `can`). */
export function effectivePermissionCeiling(role: UserRole, module: PermissionModule): PermissionAction | null {
  if (can([role], "APPROVE", module)) return "APPROVE";
  if (can([role], "EDIT", module)) return "EDIT";
  if (can([role], "VIEW", module)) return "VIEW";
  return null;
}

export type PermissionMatrixGrid = {
  roles: readonly UserRole[];
  modules: readonly PermissionModule[];
  /** grid[role][module] = ceiling or null */
  grid: Record<UserRole, Record<PermissionModule, PermissionAction | null>>;
};

export function buildPermissionMatrixGrid(): PermissionMatrixGrid {
  const grid = {} as Record<UserRole, Record<PermissionModule, PermissionAction | null>>;
  for (const role of OVERVIEW_ROLES) {
    const row = {} as Record<PermissionModule, PermissionAction | null>;
    for (const m of OVERVIEW_MODULES) {
      row[m] = effectivePermissionCeiling(role, m);
    }
    grid[role] = row;
  }
  return { roles: OVERVIEW_ROLES, modules: OVERVIEW_MODULES, grid };
}
