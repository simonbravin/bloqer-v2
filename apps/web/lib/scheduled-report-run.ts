import type { ServiceContext } from "@bloqer/services";
import {
  retryScheduledReportFailedDeliveries,
  runScheduledReportNow,
  type ScheduledReportRunSummary,
} from "@bloqer/services";
import { buildScheduledReportAttachment } from "./scheduled-report-attachment-bridge";

export async function executeScheduledReportNow(
  ctx: ServiceContext,
  scheduleId: string,
): Promise<ScheduledReportRunSummary> {
  return runScheduledReportNow(ctx, scheduleId, buildScheduledReportAttachment);
}

export async function executeScheduledReportRetryFailed(
  ctx: ServiceContext,
  scheduleId: string,
): Promise<ScheduledReportRunSummary> {
  return retryScheduledReportFailedDeliveries(ctx, scheduleId, buildScheduledReportAttachment);
}
