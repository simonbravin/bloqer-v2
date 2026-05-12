import type { PermissionModule } from "@bloqer/domain";

/** Structured tenant-module exclusions for cross-module reports (Phase 12D). */
export type TenantModuleSectionExcludedWarning = {
  module: PermissionModule;
  section: string;
  reason: "TENANT_MODULE_DISABLED";
};
