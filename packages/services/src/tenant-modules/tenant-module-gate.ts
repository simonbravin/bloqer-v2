import type { PermissionModule } from "@bloqer/domain";

/** Resolved once per request; `isEnabled` defaults missing DB rows to enabled (Phase 12B). */
export type TenantModuleGate = {
  isEnabled(module: PermissionModule): boolean;
};
