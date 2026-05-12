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
  buildPermissionMatrixGrid,
  effectivePermissionCeiling,
  type PermissionMatrixGrid,
} from "./permissions/matrix-overview";
