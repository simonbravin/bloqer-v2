import assert from "node:assert/strict";
import { test } from "node:test";
import {
  daysOverdueFromDate,
  isPurchaseOrderAwaitingReceipt,
  isPurchaseRequestOpen,
  purchaseOrderDeliveryOverdueDays,
  purchaseRequestNeededByOverdueDays,
} from "./purchase-delivery-overdue";

// daysOverdueFromDate uses `new Date()` so we clamp system time via a fixed reference.
// The consumers here are pure functions of the input Date, so we only assert edge cases
// that hold regardless of the current date.

test("daysOverdueFromDate returns 0 for null/undefined", () => {
  assert.equal(daysOverdueFromDate(null), 0);
  assert.equal(daysOverdueFromDate(undefined), 0);
});

test("daysOverdueFromDate never returns a negative number for future references", () => {
  const inTenYears = new Date(Date.UTC(new Date().getUTCFullYear() + 10, 0, 1));
  assert.equal(daysOverdueFromDate(inTenYears), 0);
});

test("isPurchaseOrderAwaitingReceipt only accepts CONFIRMED / PARTIALLY_RECEIVED", () => {
  assert.equal(isPurchaseOrderAwaitingReceipt("CONFIRMED"), true);
  assert.equal(isPurchaseOrderAwaitingReceipt("PARTIALLY_RECEIVED"), true);
  assert.equal(isPurchaseOrderAwaitingReceipt("RECEIVED"), false);
  assert.equal(isPurchaseOrderAwaitingReceipt("APPROVED"), false);
  assert.equal(isPurchaseOrderAwaitingReceipt("DRAFT"), false);
  assert.equal(isPurchaseOrderAwaitingReceipt("CANCELLED"), false);
});

test("isPurchaseRequestOpen only accepts SUBMITTED / QUOTE_SELECTED", () => {
  assert.equal(isPurchaseRequestOpen("SUBMITTED"), true);
  assert.equal(isPurchaseRequestOpen("QUOTE_SELECTED"), true);
  assert.equal(isPurchaseRequestOpen("COMPLETED"), false);
  assert.equal(isPurchaseRequestOpen("DRAFT"), false);
  assert.equal(isPurchaseRequestOpen("CANCELLED"), false);
});

test("purchaseOrderDeliveryOverdueDays gates by status even with past expectedDeliveryDate", () => {
  const yearAgo = new Date(Date.UTC(new Date().getUTCFullYear() - 1, 0, 1));
  // Only receipt-awaiting statuses ever return > 0.
  assert.ok(purchaseOrderDeliveryOverdueDays("CONFIRMED", yearAgo) > 0);
  assert.ok(purchaseOrderDeliveryOverdueDays("PARTIALLY_RECEIVED", yearAgo) > 0);
  assert.equal(purchaseOrderDeliveryOverdueDays("RECEIVED", yearAgo), 0);
  assert.equal(purchaseOrderDeliveryOverdueDays("DRAFT", yearAgo), 0);
  assert.equal(purchaseOrderDeliveryOverdueDays("CONFIRMED", null), 0);
});

test("purchaseRequestNeededByOverdueDays gates by status even with past neededByDate", () => {
  const yearAgo = new Date(Date.UTC(new Date().getUTCFullYear() - 1, 0, 1));
  assert.ok(purchaseRequestNeededByOverdueDays("SUBMITTED", yearAgo) > 0);
  assert.ok(purchaseRequestNeededByOverdueDays("QUOTE_SELECTED", yearAgo) > 0);
  assert.equal(purchaseRequestNeededByOverdueDays("COMPLETED", yearAgo), 0);
  assert.equal(purchaseRequestNeededByOverdueDays("DRAFT", yearAgo), 0);
  assert.equal(purchaseRequestNeededByOverdueDays("SUBMITTED", null), 0);
});
