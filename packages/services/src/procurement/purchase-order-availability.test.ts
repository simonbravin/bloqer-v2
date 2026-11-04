import assert from "node:assert/strict";
import { test } from "node:test";

import { getPurchaseOrderApprovalAvailability } from "./purchase-order-workflow.service";

const settings = { allowSelfApproval: false, poApprovalThresholdArs: "1000" };
const po = { status: "SUBMITTED", currency: "ARS", totalAmount: "100", fxRate: "1", originRequestedByUserId: "requester", lines: [] };

test("approval availability preserves return while blocking requester self-approval", () => {
  const result = getPurchaseOrderApprovalAvailability(settings, po, { actorUserId: "requester", roles: ["OWNER"] });
  assert.equal(result.canApprove, false); assert.equal(result.canReturn, true); assert.ok(result.approvalBlockedReason);
});

test("approval availability derives high-level restrictions from native amount and FX", () => {
  const result = getPurchaseOrderApprovalAvailability(settings, { ...po, currency: "USD", totalAmount: "10", fxRate: "200", totalAmountArs: "0" }, { actorUserId: "buyer", roles: ["PROCUREMENT"] });
  assert.equal(result.canApprove, false); assert.equal(result.canReturn, false); assert.ok(result.approvalBlockedReason);
});

test("approval availability allows the other high-level owner and keeps completed documents read-only", () => {
  assert.equal(getPurchaseOrderApprovalAvailability(settings, { ...po, totalAmount: "2000" }, { actorUserId: "other-owner", roles: ["OWNER"] }).canApprove, true);
  assert.deepEqual(getPurchaseOrderApprovalAvailability(settings, { ...po, status: "CONFIRMED" }, { actorUserId: "other-owner", roles: ["OWNER"] }), { canApprove: false, canReturn: false, approvalBlockedReason: null });
});
