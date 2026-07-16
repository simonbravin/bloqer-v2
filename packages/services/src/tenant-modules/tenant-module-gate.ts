import type { PermissionModule } from "@bloqer/domain";

/**
 * Resolve whether a tenant module is enabled.
 * **Default-on:** missing DB row ⇒ enabled (Phase 12B). Explicit `false` disables.
 */
export function resolveTenantModuleEnabled(
  byKey: ReadonlyMap<string, boolean>,
  module: PermissionModule,
): boolean {
  const v = byKey.get(module);
  if (v === undefined) return true;
  return v;
}

/** Resolved once per request; `isEnabled` defaults missing DB rows to enabled (Phase 12B). */
export type TenantModuleGate = {
  isEnabled(module: PermissionModule): boolean;
};

export function createTenantModuleGate(byKey: ReadonlyMap<string, boolean>): TenantModuleGate {
  return {
    isEnabled(module: PermissionModule) {
      return resolveTenantModuleEnabled(byKey, module);
    },
  };
}
