import { prisma } from "@bloqer/database";
import {
  buildOperationalAlertsCronServiceContext,
  runAllOperationalAlertsForSystemContext,
} from "./operational-alerts-runner.service";

export type CronOperationalAlertsTenantSummary = {
  tenantId: string;
  ok: boolean;
  checkedCount: number;
  createdCount: number;
  skippedCount: number;
  errorCount: number;
};

export type CronOperationalAlertsJobResult = {
  ok: true;
  tenantsProcessed: number;
  totals: {
    checkedCount: number;
    createdCount: number;
    skippedCount: number;
    errorCount: number;
  };
  tenants: CronOperationalAlertsTenantSummary[];
};

function emptyTotals(): CronOperationalAlertsJobResult["totals"] {
  return { checkedCount: 0, createdCount: 0, skippedCount: 0, errorCount: 0 };
}

function summarizeTenantRun(
  tenantId: string,
  ok: boolean,
  r: Awaited<ReturnType<typeof runAllOperationalAlertsForSystemContext>>,
): CronOperationalAlertsTenantSummary {
  return {
    tenantId,
    ok,
    checkedCount: r.totals.checkedCount,
    createdCount: r.totals.createdCount,
    skippedCount: r.totals.skippedCount,
    errorCount: r.totals.errorCount,
  };
}

/**
 * Run all operational alerts for one ACTIVE tenant (no session). Caller must authorize (CRON_SECRET at HTTP).
 */
export async function runOperationalAlertsForTenant(tenantId: string): Promise<CronOperationalAlertsJobResult> {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, status: "ACTIVE" },
    select: { id: true },
  });

  if (!tenant) {
    return {
      ok: true,
      tenantsProcessed: 0,
      totals: emptyTotals(),
      tenants: [],
    };
  }

  try {
    const ctx = buildOperationalAlertsCronServiceContext(tenantId);
    const result = await runAllOperationalAlertsForSystemContext(ctx);
    const row = summarizeTenantRun(tenantId, true, result);
    return {
      ok: true,
      tenantsProcessed: 1,
      totals: { ...result.totals },
      tenants: [row],
    };
  } catch (e) {
    console.error(`[operational-alerts-cron] tenant fatal tenantId=${tenantId}`, e instanceof Error ? e.message : e);
    return {
      ok: true,
      tenantsProcessed: 1,
      totals: { checkedCount: 0, createdCount: 0, skippedCount: 0, errorCount: 1 },
      tenants: [
        {
          tenantId,
          ok: false,
          checkedCount: 0,
          createdCount: 0,
          skippedCount: 0,
          errorCount: 1,
        },
      ],
    };
  }
}

/**
 * Run all operational alerts for every ACTIVE tenant. One tenant failure does not stop the rest.
 */
export async function runOperationalAlertsForAllActiveTenants(): Promise<CronOperationalAlertsJobResult> {
  const tenantRows = await prisma.tenant.findMany({
    where: { status: "ACTIVE" },
    select: { id: true },
    orderBy: { id: "asc" },
  });

  const tenants: CronOperationalAlertsTenantSummary[] = [];
  const totals = emptyTotals();

  for (const { id } of tenantRows) {
    try {
      const ctx = buildOperationalAlertsCronServiceContext(id);
      const result = await runAllOperationalAlertsForSystemContext(ctx);
      tenants.push(summarizeTenantRun(id, true, result));
      totals.checkedCount += result.totals.checkedCount;
      totals.createdCount += result.totals.createdCount;
      totals.skippedCount += result.totals.skippedCount;
      totals.errorCount += result.totals.errorCount;
    } catch (e) {
      console.error(`[operational-alerts-cron] tenant fatal tenantId=${id}`, e instanceof Error ? e.message : e);
      tenants.push({
        tenantId: id,
        ok: false,
        checkedCount: 0,
        createdCount: 0,
        skippedCount: 0,
        errorCount: 1,
      });
      totals.errorCount += 1;
    }
  }

  return {
    ok: true,
    tenantsProcessed: tenants.length,
    totals,
    tenants,
  };
}
