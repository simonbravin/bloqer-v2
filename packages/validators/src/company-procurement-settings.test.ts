import assert from "node:assert/strict";
import { test } from "node:test";

import { upsertCompanyProcurementSettingsSchema as schema } from "./company-procurement-settings";

test("D-053 procurement policy normalizes money and rates before persistence", () => {
  const parsed = schema.parse({ poApprovalThresholdArs: "100.005", overReceiptTolerancePct: "2.123456" });
  assert.equal(parsed.poApprovalThresholdArs, "100.01");
  assert.equal(parsed.overReceiptTolerancePct, "2.1235");
});

test("a false string cannot silently enable a procurement policy", () => {
  assert.equal(schema.safeParse({ allowAuthorizeAndCommit: "false" }).success, false);
  assert.equal(schema.parse({ allowAuthorizeAndCommit: false }).allowAuthorizeAndCommit, false);
});

test("partial procurement policy preserves omission and explicit clearing", () => {
  const parsed = schema.parse({ poApprovalThresholdArs: null });
  assert.equal(parsed.poApprovalThresholdArs, null);
  assert.equal(Object.hasOwn(parsed, "allowSelfApproval"), false);
  assert.equal(Object.hasOwn(parsed, "maxQuotesAllowed"), false);
});

test("procurement quote limits and existing variance boundaries reject contradictions", () => {
  assert.equal(schema.safeParse({ minQuotesRequired: 4, maxQuotesAllowed: 3 }).success, false);
  assert.equal(schema.safeParse({ varianceSoftAlertPct: "25", varianceExtraApprovalPct: "25" }).success, false);
  assert.equal(schema.safeParse({ varianceSoftAlertPct: "11", varianceNoteRequiredPct: "10" }).success, false);
});

test("D-067 procurement tolerances retain their documented caps", () => {
  assert.equal(schema.safeParse({ overReceiptTolerancePct: "5" }).success, true);
  assert.equal(schema.safeParse({ overReceiptTolerancePct: "5.0001" }).success, false);
  assert.equal(schema.safeParse({ invoiceMatchTolerancePct: "25" }).success, true);
  assert.equal(schema.safeParse({ invoiceMatchTolerancePct: "25.0001" }).success, false);
  assert.equal(schema.safeParse({ overReceiptTolerancePct: "-0.0001" }).success, false);
});

test("procurement policy rejects values outside existing database precision", () => {
  assert.equal(schema.safeParse({ poApprovalThresholdArs: "99999999999999.99" }).success, true);
  assert.equal(schema.safeParse({ poApprovalThresholdArs: "100000000000000" }).success, false);
  assert.equal(schema.safeParse({ varianceSoftAlertPct: "10000" }).success, false);
  assert.equal(schema.safeParse({ poApprovalThresholdArs: "Infinity" }).success, false);
});

test("the existing optional category list is validated without inventing categories", () => {
  assert.deepEqual(schema.parse({ quoteRequiredCategories: ["existing-custom-category"] }).quoteRequiredCategories, ["existing-custom-category"]);
  assert.equal(schema.parse({ quoteRequiredCategories: null }).quoteRequiredCategories, null);
  assert.equal(schema.safeParse({ quoteRequiredCategories: [42] }).success, false);
});
