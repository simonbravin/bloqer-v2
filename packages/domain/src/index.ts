export type { UserRole } from "./permissions/roles";
export type { PermissionAction, PermissionModule } from "./permissions/matrix";
export { can } from "./permissions/matrix";
export {
  TENANT_MODULE_LABEL_ES,
  listSupportedTenantModules,
} from "./tenant-modules/supported-modules";
export {
  OVERVIEW_MODULES,
  OVERVIEW_ROLES,
  OVERVIEW_MODULE_KEYS_FOR_ZOD,
  buildPermissionMatrixGrid,
  effectivePermissionCeiling,
  getPermissionModuleGroupSections,
  PERMISSION_MODULE_GROUP,
  type OverviewPermissionModule,
  type PermissionModuleGroupId,
  type PermissionModuleGroupSection,
  type PermissionMatrixGrid,
} from "./permissions/matrix-overview";
