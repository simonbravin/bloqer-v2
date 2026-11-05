import assert from "node:assert/strict";
import { test } from "node:test";

import { sendReportByEmailInputSchema } from "./report-email";
import { createScheduledReportSchema } from "./scheduled-report";

const projectId = "a0000000-0000-4000-8000-000000000001";
const recipientId = "a0000000-0000-4000-8000-000000000002";

test("only manual project reports may provide a project for the attachment and email metadata", () => {
  const input = { format: "csv", recipientEmail: "recipient@example.test" };
  assert.equal(sendReportByEmailInputSchema.safeParse({
    ...input, reportType: "AR_AGING",
  }).success, true);
  assert.equal(sendReportByEmailInputSchema.safeParse({
    ...input, reportType: "AR_AGING", projectId,
  }).success, false);
  assert.equal(sendReportByEmailInputSchema.safeParse({
    ...input, reportType: "PROJECT_PROGRESS",
  }).success, false);
  assert.equal(sendReportByEmailInputSchema.safeParse({
    ...input, reportType: "PROJECT_PROGRESS", projectId,
  }).success, true);
});

test("schedule time accepts browser seconds and rejects trailing junk", () => {
  const input = {
    name: "Reporte",
    scope: "TENANT",
    format: "CSV",
    items: [{ reportKey: "TENANT_AR_AGING" }],
    recipientUserIds: [recipientId],
    frequency: "DAILY",
  };
  assert.equal(createScheduledReportSchema.parse({ ...input, timeOfDay: "06:30:00" }).timeOfDay, "06:30");
  for (const timeOfDay of ["06:30junk", "06:30:99", "06:30:00:00"]) {
    assert.equal(createScheduledReportSchema.safeParse({ ...input, timeOfDay }).success, false);
  }
});
