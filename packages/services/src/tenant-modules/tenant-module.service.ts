import { prisma } from "@bloqer/database";
import { OVERVIEW_MODULES, type PermissionModule } from "@bloqer/domain";
import { ServiceError } from "../types";
import type { ServiceContext } from "../types";
import {
  createTenantModuleGate,
  type TenantModuleGate,
} from "./tenant-module-gate";

export type { TenantModuleGate } from "./tenant-module-gate";
export { resolveTenantModuleEnabled, createTenantModuleGate } from "./tenant-module-gate";

export async function getTenantModuleGate(ctx: ServiceContext): Promise<TenantModuleGate> {
  const rows = await prisma.tenantModuleSetting.findMany({
    where: { tenantId: ctx.tenantId },
    select: { moduleKey: true, isEnabled: true },
  });
  const byKey = new Map(rows.map((r) => [r.moduleKey, r.isEnabled]));
  return createTenantModuleGate(byKey);
}

/** Modules that are enabled for this tenant (respecting default-on when no row). */
export async function getTenantEnabledModules(
  ctx: ServiceContext,
): Promise<ReadonlySet<PermissionModule>> {
  const gate = await getTenantModuleGate(ctx);
  const enabled = new Set<PermissionModule>();
  for (const m of OVERVIEW_MODULES) {
    if (gate.isEnabled(m)) enabled.add(m);
  }
  return enabled;
}

export async function isTenantModuleEnabled(
  ctx: ServiceContext,
  moduleKey: PermissionModule,
): Promise<boolean> {
  const gate = await getTenantModuleGate(ctx);
  return gate.isEnabled(moduleKey);
}

/** For use after `getTenantModuleGate` (avoids duplicate queries). */
export function assertTenantModuleEnabledWithGate(
  gate: TenantModuleGate,
  moduleKey: PermissionModule,
): void {
  if (!gate.isEnabled(moduleKey)) {
    throw new ServiceError("FORBIDDEN", "El módulo está deshabilitado para este tenant.");
  }
}

export async function assertTenantModuleEnabled(
  ctx: ServiceContext,
  moduleKey: PermissionModule,
): Promise<void> {
  const gate = await getTenantModuleGate(ctx);
  assertTenantModuleEnabledWithGate(gate, moduleKey);
}

export { listSupportedTenantModules } from "@bloqer/domain";
