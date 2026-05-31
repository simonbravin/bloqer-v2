import type { ServiceContext } from "../types";

/** Sentinel actor for scheduled report cron — not a User row. */
export const SCHEDULED_REPORTS_CRON_ACTOR_USER_ID = "system:scheduled-reports-cron";

/**
 * System context for cron exports. Uses OWNER so existing report readers accept the job;
 * module gates are still enforced per report key at run time.
 */
export function buildScheduledReportsCronServiceContext(
  tenantId: string,
  companyId: string | null,
): ServiceContext {
  return {
    actorUserId: SCHEDULED_REPORTS_CRON_ACTOR_USER_ID,
    tenantId,
    companyId,
    roles: ["OWNER"],
  };
}
