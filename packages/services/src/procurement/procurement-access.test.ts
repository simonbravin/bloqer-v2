import { can } from "@bloqer/domain";
import assert from "node:assert/strict";
import { test } from "node:test";
import { canApprovePurchaseOrders } from "./procurement-access";

test("PROJECT_MANAGER cannot approve purchase orders", () => {
  assert.equal(canApprovePurchaseOrders(["PROJECT_MANAGER"]), false);
  assert.equal(can(["PROJECT_MANAGER"], "APPROVE", "PURCHASE_ORDERS"), false);
});

test("OWNER can approve purchase orders", () => {
  assert.equal(canApprovePurchaseOrders(["OWNER"]), true);
});

test("VIEWER cannot approve purchase orders", () => {
  assert.equal(canApprovePurchaseOrders(["VIEWER"]), false);
});
