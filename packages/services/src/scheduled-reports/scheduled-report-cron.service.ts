import { prisma } from "@bloqer/database";
import type { BuildScheduledReportAttachmentFn } from "./scheduled-report-attachment.service";
import {
  runDueScheduledReportsForTenant,
  type ScheduledReportRunSummary,
} from "./scheduled-report-runner.service";

export type CronScheduledReportsTenantSummary = {
  tenantId: string;
  ok: boolean;
  schedulesProcessed: number;
  sent: number;
  skipped: number;
  failed: number;
  duplicate: number;
  locked: number;
};

export type CronScheduledReportsJobResult = {
  ok: true;
  tenantsProcessed: number;
  totals: {
    schedulesProcessed: number;
    sent: number;
    skipped: number;
    failed: number;
    duplicate: number;
    locked: number;
  };
  tenants: CronScheduledReportsTenantSummary[];
};

function summarizeRuns(runs: ScheduledReportRunSummary[]): Omit<CronScheduledReportsTenantSummary, "tenantId" | "ok"> {
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let duplicate = 0;
  let locked = 0;
  for (const r of runs) {
    sent += r.recipientsSent;
    skipped += r.recipientsSkipped;
    failed += r.recipientsFailed;
    duplicate += r.recipientsDuplicate;
    if (r.runStatus === "LOCKED") locked += 1;
  }
  return {
    schedulesProcessed: runs.length,
    sent,
    skipped,
    failed,
    duplicate,
    locked,
  };
}

export async function runScheduledReportsForTenant(
  tenantId: string,
  buildAttachment: BuildScheduledReportAttachmentFn,
): Promise<CronScheduledReportsJobResult> {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!tenant) {
    return {
      ok: true,
      tenantsProcessed: 0,
      totals: {
        schedulesProcessed: 0,
        sent: 0,
        skipped: 0,
        failed: 0,
        duplicate: 0,
        locked: 0,
      },
      tenants: [],
    };
  }

  try {
    const runs = await runDueScheduledReportsForTenant(tenantId, buildAttachment);
    const stats = summarizeRuns(runs);
    return {
      ok: true,
      tenantsProcessed: 1,
      totals: { ...stats },
      tenants: [{ tenantId, ok: true, ...stats }],
    };
  } catch (e) {
    console.error(
      `[scheduled-reports-cron] tenant fatal tenantId=${tenantId}`,
      e instanceof Error ? e.message : e,
    );
    return {
      ok: true,
      tenantsProcessed: 1,
      totals: {
        schedulesProcessed: 0,
        sent: 0,
        skipped: 0,
        failed: 1,
        duplicate: 0,
        locked: 0,
      },
      tenants: [
        {
          tenantId,
          ok: false,
          schedulesProcessed: 0,
          sent: 0,
          skipped: 0,
          failed: 1,
          duplicate: 0,
          locked: 0,
        },
      ],
    };
  }
}

export async function runScheduledReportsForAllActiveTenants(
  buildAttachment: BuildScheduledReportAttachmentFn,
): Promise<CronScheduledReportsJobResult> {
  const tenantRows = await prisma.tenant.findMany({
    where: { status: "ACTIVE" },
    select: { id: true },
    orderBy: { id: "asc" },
  });

  const tenants: CronScheduledReportsTenantSummary[] = [];
  const totals = {
    schedulesProcessed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    duplicate: 0,
    locked: 0,
  };

  for (const { id } of tenantRows) {
    const one = await runScheduledReportsForTenant(id, buildAttachment);
    if (one.tenants[0]) {
      tenants.push(one.tenants[0]);
      totals.schedulesProcessed += one.tenants[0].schedulesProcessed;
      totals.sent += one.tenants[0].sent;
      totals.skipped += one.tenants[0].skipped;
      totals.failed += one.tenants[0].failed;
      totals.duplicate += one.tenants[0].duplicate;
      totals.locked += one.tenants[0].locked;
    }
  }

  return {
    ok: true,
    tenantsProcessed: tenants.length,
    totals,
    tenants,
  };
}
