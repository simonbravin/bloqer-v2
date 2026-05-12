import type { ServiceContext } from "../types";
import { ServiceError } from "../types";
import {
  runApprovedCertificationsWithoutInvoiceAlert,
  runNegativeStockAlert,
  runOverduePayablesAlert,
  runOverdueReceivablesAlert,
  runStaleUploadingDocumentsAlert,
  type OperationalAlertRunSummary,
} from "./operational-alerts.service";

export const OPERATIONAL_ALERT_TYPES = [
  "overdueReceivables",
  "overduePayables",
  "negativeStock",
  "approvedCertificationsWithoutInvoice",
  "staleUploadingDocuments",
] as const;

export type OperationalAlertType = (typeof OPERATIONAL_ALERT_TYPES)[number];

export function isOperationalAlertType(v: string): v is OperationalAlertType {
  return (OPERATIONAL_ALERT_TYPES as readonly string[]).includes(v);
}

export type OperationalAlertRunResult = {
  alertType: OperationalAlertType;
  checkedCount: number;
  createdCount: number;
  skippedCount: number;
  errors: string[];
};

export type RunAllOperationalAlertsResult = {
  runs: OperationalAlertRunResult[];
  totals: {
    checkedCount: number;
    createdCount: number;
    skippedCount: number;
    errorCount: number;
  };
};

/** Manual / future cron entrypoint: only OWNER or ADMIN with active tenant context. */
export function canRunOperationalAlerts(ctx: ServiceContext): boolean {
  return ctx.roles.some((r) => r === "OWNER" || r === "ADMIN");
}

/** Sentinel actor for cron/system jobs — not a User row; Phase 8B runners only use `ctx.tenantId`. */
export const OPERATIONAL_ALERTS_CRON_ACTOR_USER_ID = "system:operational-alerts-cron";

export function buildOperationalAlertsCronServiceContext(tenantId: string): ServiceContext {
  return {
    actorUserId: OPERATIONAL_ALERTS_CRON_ACTOR_USER_ID,
    tenantId,
    companyId: null,
    roles: [],
  };
}

async function dispatchOperationalAlert(
  alertType: OperationalAlertType,
  ctx: ServiceContext,
): Promise<OperationalAlertRunSummary> {
  switch (alertType) {
    case "overdueReceivables":
      return runOverdueReceivablesAlert(ctx);
    case "overduePayables":
      return runOverduePayablesAlert(ctx);
    case "negativeStock":
      return runNegativeStockAlert(ctx);
    case "approvedCertificationsWithoutInvoice":
      return runApprovedCertificationsWithoutInvoiceAlert(ctx);
    case "staleUploadingDocuments":
      return runStaleUploadingDocumentsAlert(ctx);
  }
}

function toResult(alertType: OperationalAlertType, s: OperationalAlertRunSummary): OperationalAlertRunResult {
  return {
    alertType,
    checkedCount: s.checkedCount,
    createdCount: s.createdCount,
    skippedCount: s.skippedCount,
    errors: s.errors,
  };
}

/**
 * Run a single operational alert fan-out for the current tenant.
 * @throws ServiceError FORBIDDEN if caller is not OWNER/ADMIN
 */
export async function runOperationalAlert(
  alertType: OperationalAlertType,
  ctx: ServiceContext,
): Promise<OperationalAlertRunResult> {
  if (!canRunOperationalAlerts(ctx)) {
    throw new ServiceError("FORBIDDEN", "Solo OWNER o ADMIN pueden ejecutar alertas operativas");
  }
  const summary = await dispatchOperationalAlert(alertType, ctx);
  return toResult(alertType, summary);
}

/**
 * Run all operational alert jobs sequentially for the tenant.
 * @throws ServiceError FORBIDDEN if caller is not OWNER/ADMIN
 */
export async function runAllOperationalAlerts(ctx: ServiceContext): Promise<RunAllOperationalAlertsResult> {
  if (!canRunOperationalAlerts(ctx)) {
    throw new ServiceError("FORBIDDEN", "Solo OWNER o ADMIN pueden ejecutar alertas operativas");
  }

  const runs: OperationalAlertRunResult[] = [];
  let checkedCount = 0;
  let createdCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const alertType of OPERATIONAL_ALERT_TYPES) {
    const summary = await dispatchOperationalAlert(alertType, ctx);
    runs.push(toResult(alertType, summary));
    checkedCount += summary.checkedCount;
    createdCount += summary.createdCount;
    skippedCount += summary.skippedCount;
    errorCount += summary.errors.length;
  }

  return {
    runs,
    totals: { checkedCount, createdCount, skippedCount, errorCount },
  };
}

/**
 * Runs all five operational alert jobs for one tenant without OWNER/ADMIN checks.
 * HTTP/cron layer must enforce auth (e.g. CRON_SECRET). Per-alert failures are isolated.
 */
export async function runAllOperationalAlertsForSystemContext(ctx: ServiceContext): Promise<RunAllOperationalAlertsResult> {
  const runs: OperationalAlertRunResult[] = [];
  let checkedCount = 0;
  let createdCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const alertType of OPERATIONAL_ALERT_TYPES) {
    try {
      const summary = await dispatchOperationalAlert(alertType, ctx);
      runs.push(toResult(alertType, summary));
      checkedCount += summary.checkedCount;
      createdCount += summary.createdCount;
      skippedCount += summary.skippedCount;
      errorCount += summary.errors.length;
    } catch (e) {
      errorCount += 1;
      runs.push({
        alertType,
        checkedCount: 0,
        createdCount: 0,
        skippedCount: 0,
        errors: [],
      });
      console.error(
        `[operational-alerts] system run failed tenant=${ctx.tenantId} alert=${alertType}`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  return {
    runs,
    totals: { checkedCount, createdCount, skippedCount, errorCount },
  };
}
