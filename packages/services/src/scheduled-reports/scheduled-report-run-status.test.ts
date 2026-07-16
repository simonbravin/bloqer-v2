import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveScheduledReportRunStatus } from "./scheduled-report-run-status";

test("all duplicate recipients produce a skipped run", () => {
  assert.equal(
    deriveScheduledReportRunStatus({
      recipientsSent: 0,
      recipientsSkipped: 0,
      recipientsFailed: 0,
      recipientsDuplicate: 2,
      attachmentErrorCount: 0,
    }),
    "SKIPPED",
  );
});

test("a successful delivery remains successful with duplicate recipients", () => {
  assert.equal(
    deriveScheduledReportRunStatus({
      recipientsSent: 1,
      recipientsSkipped: 0,
      recipientsFailed: 0,
      recipientsDuplicate: 1,
      attachmentErrorCount: 0,
    }),
    "SUCCESS",
  );
});

test("mixed sent and failed recipients produce a partial run", () => {
  assert.equal(
    deriveScheduledReportRunStatus({
      recipientsSent: 1,
      recipientsSkipped: 0,
      recipientsFailed: 1,
      recipientsDuplicate: 0,
      attachmentErrorCount: 0,
    }),
    "PARTIAL",
  );
});
