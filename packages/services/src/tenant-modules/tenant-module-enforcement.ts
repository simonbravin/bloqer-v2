import type { ServiceContext } from "../types";
import { assertTenantModuleEnabled } from "./tenant-module.service";

/** Service-level tenant module gates (Phase 12C). Call before role checks so disabled modules return a single consistent error. */

export async function assertAccountingTenantModule(ctx: ServiceContext): Promise<void> {
  await assertTenantModuleEnabled(ctx, "ACCOUNTING");
}

export async function assertTreasuryTenantModule(ctx: ServiceContext): Promise<void> {
  await assertTenantModuleEnabled(ctx, "TREASURY");
}

export async function assertArTenantModule(ctx: ServiceContext): Promise<void> {
  await assertTenantModuleEnabled(ctx, "AR");
}

export async function assertApTenantModule(ctx: ServiceContext): Promise<void> {
  await assertTenantModuleEnabled(ctx, "AP");
}

export async function assertInventoryTenantModule(ctx: ServiceContext): Promise<void> {
  await assertTenantModuleEnabled(ctx, "INVENTORY");
}

export async function assertProcurementTenantModule(ctx: ServiceContext): Promise<void> {
  await assertTenantModuleEnabled(ctx, "PROCUREMENT");
}

export async function assertSubcontractsTenantModule(ctx: ServiceContext): Promise<void> {
  await assertTenantModuleEnabled(ctx, "SUBCONTRACTS");
}

/** Phase 13G — libro de obra; align with `document.service` mutations on `linkedEntityType=JOBSITE_LOG`. */
export async function assertJobsiteLogTenantModule(ctx: ServiceContext): Promise<void> {
  await assertTenantModuleEnabled(ctx, "JOBSITE_LOG");
}
