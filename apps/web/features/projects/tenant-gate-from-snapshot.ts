import type { PermissionModule } from "@bloqer/domain";
import type { TenantModuleGate } from "@bloqer/services/tenant-module-gate";

/**
 * Reconstructs the same default-on semantics as {@link getTenantModuleGate} for client-side nav.
 */
export function tenantGateFromSnapshot(
  snapshot: Partial<Record<PermissionModule, boolean>>,
): TenantModuleGate {
  return {
    isEnabled(module: PermissionModule) {
      const v = snapshot[module];
      if (v === undefined) return true;
      return v;
    },
  };
}
