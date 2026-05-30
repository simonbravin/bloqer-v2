export type { UserRole } from "./permissions/roles";
export type { PermissionAction, PermissionModule } from "./permissions/matrix";
export { can, canManageProjectLifecycleAdmin } from "./permissions/matrix";
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
export {
  AUDIT_UI_MODULES,
  AUDIT_UI_MODULE_LABEL_ES,
  AUDIT_MODULE_ENTITY_TYPES,
  ALL_PROJECT_SCOPED_ENTITY_TYPES,
  AUDIT_MODULES_WITHOUT_PROJECT_SCOPE,
  AUDIT_ACTION_LABELS_ES,
  resolveAuditModuleForEntityType,
  entityTypesForAuditModule,
  resolveAuditActionLabel,
  type AuditUiModule,
} from "./audit/audit-catalog";
