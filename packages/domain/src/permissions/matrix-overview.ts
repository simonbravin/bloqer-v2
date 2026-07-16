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
  "PURCHASE_REQUESTS",
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

/**
 * Permission modules that exist in RBAC / tenant toggles but have **no operable product UI**
 * in this version. Shown as “No disponibles” in `/configuracion/permisos`; still seedable
 * in `TenantModuleSetting` for future phases. Do **not** add BILLING / TENANT_TRANSFER here
 * without a separate product decision (platform-scoped).
 */
export const MODULES_UNAVAILABLE_IN_THIS_VERSION: readonly PermissionModule[] = [
  "CONTRACTS",
  "CHANGE_ORDERS",
  "RFIS",
  "BANK_RECONCILIATION",
  "TAXES",
] as const;

const UNAVAILABLE_MODULE_SET = new Set<string>(MODULES_UNAVAILABLE_IN_THIS_VERSION);

export function isPermissionModuleUnavailableInThisVersion(module: PermissionModule): boolean {
  return UNAVAILABLE_MODULE_SET.has(module);
}

/** Overview columns that are operable (or at least present) in the current product UI. */
export function getOperableOverviewModules(): readonly PermissionModule[] {
  return OVERVIEW_MODULES.filter((m) => !isPermissionModuleUnavailableInThisVersion(m));
}

/** Subset of `PermissionModule` used in the read-only matrix UI — keep in sync with `OVERVIEW_MODULES`. */
export type OverviewPermissionModule = (typeof OVERVIEW_MODULES)[number];

/**
 * UI grouping for `/configuracion/permisos` (accordion). Does not change RBAC — only presentation order.
 */
export type PermissionModuleGroupId =
  | "directory_master"
  | "project_delivery"
  | "procurement_inventory"
  | "finance"
  | "platform";

const PERMISSION_MODULE_GROUP_LABEL_ES: Record<PermissionModuleGroupId, string> = {
  directory_master:       "Directorio y datos maestros",
  project_delivery:       "Obra y entrega",
  procurement_inventory:  "Compras e inventario",
  finance:                "Finanzas y contabilidad",
  platform:               "Plataforma y gobierno",
};

const PERMISSION_MODULE_GROUP_ORDER: readonly PermissionModuleGroupId[] = [
  "directory_master",
  "project_delivery",
  "procurement_inventory",
  "finance",
  "platform",
] as const;

/** Maps each overview column to a group (must cover every entry in `OVERVIEW_MODULES`). */
export const PERMISSION_MODULE_GROUP: Record<OverviewPermissionModule, PermissionModuleGroupId> = {
  DIRECTORY:                     "directory_master",
  CLIENTS:                       "directory_master",
  SUPPLIERS:                     "directory_master",
  SUBCONTRACTORS:                "directory_master",
  MASTER_DATA:                   "directory_master",
  PROJECTS:                      "project_delivery",
  SCHEDULE:                      "project_delivery",
  BUDGETS:                       "project_delivery",
  WBS:                           "project_delivery",
  CONTRACTS:                     "project_delivery",
  CHANGE_ORDERS:                 "project_delivery",
  RFIS:                          "project_delivery",
  JOBSITE_LOG:                   "project_delivery",
  CERTIFICATIONS:                "project_delivery",
  DOCUMENTS:                     "project_delivery",
  PROCUREMENT:                   "procurement_inventory",
  PURCHASE_ORDERS:               "procurement_inventory",
  PURCHASE_REQUESTS:             "procurement_inventory",
  SUBCONTRACTS:                  "procurement_inventory",
  INVENTORY:                     "procurement_inventory",
  WAREHOUSES:                    "procurement_inventory",
  TREASURY:                      "finance",
  BANK_ACCOUNTS:                 "finance",
  BANK_RECONCILIATION:           "finance",
  EXPENSES_PAYMENTS:             "finance",
  INTERNAL_TRANSFERS:          "finance",
  AR:                            "finance",
  AP:                            "finance",
  TAXES:                         "finance",
  PERIOD_CLOSE:                  "finance",
  ACCOUNTING:                    "finance",
  CONSOLIDATED_NET_PROFITABILITY: "finance",
  NOTIFICATIONS:                 "platform",
  USERS_PERMISSIONS:             "platform",
  TENANT_SETTINGS:               "platform",
  AUDIT:                         "platform",
  BILLING:                       "platform",
  TENANT_TRANSFER:               "platform",
};

export type PermissionModuleGroupSection = {
  id:      PermissionModuleGroupId;
  labelEs: string;
  modules: readonly OverviewPermissionModule[];
};

/** Column order for matrix UI: grouped sections, each module in same relative order as operable overview modules. */
export function getPermissionModuleGroupSections(): readonly PermissionModuleGroupSection[] {
  const operable = getOperableOverviewModules();
  const buckets = new Map<PermissionModuleGroupId, OverviewPermissionModule[]>();
  for (const id of PERMISSION_MODULE_GROUP_ORDER) {
    buckets.set(id, []);
  }
  for (const m of operable) {
    const g = PERMISSION_MODULE_GROUP[m];
    buckets.get(g)!.push(m);
  }
  return PERMISSION_MODULE_GROUP_ORDER.map((id) => ({
    id,
    labelEs: PERMISSION_MODULE_GROUP_LABEL_ES[id],
    modules: buckets.get(id)!,
  })).filter((section) => section.modules.length > 0);
}

/** Labels for the “no disponible en esta versión” notice on the permissions page. */
export function getUnavailablePermissionModulesForUi(): readonly {
  moduleKey: PermissionModule;
  labelEs: string;
}[] {
  // Labels inlined to avoid circular import with supported-modules.ts
  const labels: Partial<Record<PermissionModule, string>> = {
    CONTRACTS: "Contratos / Adendas",
    CHANGE_ORDERS: "Change orders",
    RFIS: "RFIs",
    BANK_RECONCILIATION: "Conciliación bancaria",
    TAXES: "Impuestos / Retenciones",
  };
  return MODULES_UNAVAILABLE_IN_THIS_VERSION.map((moduleKey) => ({
    moduleKey,
    labelEs: labels[moduleKey] ?? moduleKey,
  }));
}

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
  const modules = getOperableOverviewModules();
  const grid = {} as Record<UserRole, Record<PermissionModule, PermissionAction | null>>;
  for (const role of OVERVIEW_ROLES) {
    const row = {} as Record<PermissionModule, PermissionAction | null>;
    for (const m of modules) {
      row[m] = effectivePermissionCeiling(role, m);
    }
    grid[role] = row;
  }
  return { roles: OVERVIEW_ROLES, modules, grid };
}

/** Same members as `OVERVIEW_MODULES`, typed for `z.enum` in `@bloqer/validators`. */
export const OVERVIEW_MODULE_KEYS_FOR_ZOD = OVERVIEW_MODULES as unknown as [
  OverviewPermissionModule,
  ...OverviewPermissionModule[],
];
