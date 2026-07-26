export type { UserRole } from "./permissions/roles";
export { COMPANY_FINANCE_ROLES, hasCompanyFinanceRole } from "./permissions/roles";
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
  MODULES_UNAVAILABLE_IN_THIS_VERSION,
  isPermissionModuleUnavailableInThisVersion,
  getOperableOverviewModules,
  buildPermissionMatrixGrid,
  effectivePermissionCeiling,
  getPermissionModuleGroupSections,
  getUnavailablePermissionModulesForUi,
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
export {
  APU_DECIMAL_PLACES,
  APU_GLOBAL_UNIT,
  canUseTotalPartidaMode,
  convertApuEntryMode,
  isGlobalUnit,
  lineUnitTotal,
  physicalNeedQty,
  previewApuEntry,
  normalizeStoredApuLineForItemQuantity,
  recomputeLumpForItemQuantity,
  recomputeResourceForItemQuantity,
  roundApuDecimal,
  roundApuMoney,
  migrateLegacyLumpToGlobalResource,
  toEntryApuLine,
  toStoredApuLine,
  type ApuEntryMode,
  type ApuEntryInput,
  type ApuEntryPreview,
  type ApuEntryReverseInput,
  type ApuLineAmounts,
  type ApuStoredLine,
  type ApuTotalKind,
  type PhysicalNeedOpts,
} from "./budget/apu-entry";

export {
  isLumpApuDisplay,
  linePartidaMoney,
  lineUnitContribution,
  resourceQtyDisplay,
  type ApuDisplayLine,
  type ResourceQtyDisplay,
} from "./budget/apu-display";

export {
  WBS_ACTIONS_COLUMN_COUNT,
  WBS_FIXED_COLUMN_COUNT,
  wbsIncidenceColumnCount,
  wbsMoneyColumnCount,
  wbsShowUnit,
  wbsTableColumnCount,
  type WbsTableViewMode,
} from "./budget/wbs-table-columns";

export {
  formatWbsIncidencePercent,
  formatWbsIncidencePercentExport,
  wbsIncidencePercent,
} from "./budget/wbs-incidence";
