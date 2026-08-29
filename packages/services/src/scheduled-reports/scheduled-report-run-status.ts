import type { ScheduledReportRunStatus } from "@bloqer/database";

export type ScheduledReportRunOutcome = {
  recipientsSent: number;
  recipientsSkipped: number;
  recipientsFailed: number;
  recipientsDuplicate: number;
  attachmentErrorCount: number;
};

export function deriveScheduledReportRunStatus(
  outcome: ScheduledReportRunOutcome,
): ScheduledReportRunStatus {
  if (outcome.recipientsFailed > 0 && outcome.recipientsSent === 0) return "FAILED";
  if (outcome.attachmentErrorCount > 0 || outcome.recipientsFailed > 0) return "PARTIAL";
  if (outcome.recipientsSent === 0) {
    // No successful delivery: skipped/duplicate, or zero recipients attempted.
    return "SKIPPED";
  }
  return "SUCCESS";
}
