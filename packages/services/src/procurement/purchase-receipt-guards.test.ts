import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@bloqer/database";
import { ServiceError } from "../types";
import { assertPoEligibleForReceipt, assertReceiptQtyWithinRemaining } from "./purchase-receipt-guards";

test("assertPoEligibleForReceipt allows CONFIRMED", () => {
  assert.doesNotThrow(() => assertPoEligibleForReceipt("CONFIRMED"));
});

test("assertPoEligibleForReceipt rejects RECEIVED", () => {
  assert.throws(
    () => assertPoEligibleForReceipt("RECEIVED"),
    (err) => err instanceof ServiceError && err.code === "CONFLICT",
  );
});

test("assertPoEligibleForReceipt allows PARTIALLY_RECEIVED", () => {
  assert.doesNotThrow(() => assertPoEligibleForReceipt("PARTIALLY_RECEIVED"));
});

test("assertReceiptQtyWithinRemaining allows within remaining", () => {
  assert.doesNotThrow(() =>
    assertReceiptQtyWithinRemaining(new Prisma.Decimal("2"), new Prisma.Decimal("5"), "Cemento"),
  );
});

test("assertReceiptQtyWithinRemaining rejects over remaining", () => {
  assert.throws(
    () => assertReceiptQtyWithinRemaining(new Prisma.Decimal("6"), new Prisma.Decimal("5"), "Cemento"),
    (err) => err instanceof ServiceError && err.code === "CONFLICT",
  );
});

test("assertReceiptQtyWithinRemaining rejects zero qty", () => {
  assert.throws(
    () => assertReceiptQtyWithinRemaining(new Prisma.Decimal("0"), new Prisma.Decimal("5"), "Cemento"),
    (err) => err instanceof ServiceError && err.code === "CONFLICT",
  );
});

test("assertReceiptQtyWithinRemaining allows over-receipt within tolerance [D-067]", () => {
  assert.doesNotThrow(() =>
    assertReceiptQtyWithinRemaining(new Prisma.Decimal("103"), new Prisma.Decimal("100"), "Cemento", {
      orderQuantity: new Prisma.Decimal("100"),
      alreadyReceived: new Prisma.Decimal("0"),
      tolerancePct: new Prisma.Decimal("5"),
    }),
  );
});

test("assertReceiptQtyWithinRemaining blocks over-receipt beyond tolerance [D-067]", () => {
  assert.throws(
    () =>
      assertReceiptQtyWithinRemaining(new Prisma.Decimal("106"), new Prisma.Decimal("100"), "Cemento", {
        orderQuantity: new Prisma.Decimal("100"),
        alreadyReceived: new Prisma.Decimal("0"),
        tolerancePct: new Prisma.Decimal("5"),
      }),
    (err) => err instanceof ServiceError && err.code === "CONFLICT",
  );
});
