import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@bloqer/database";
import { ServiceError } from "../types";
import { assertPoEligibleForReceipt, assertReceiptQtyWithinRemaining } from "./purchase-receipt-guards";

test("assertPoEligibleForReceipt allows CONFIRMED", () => {
  assert.doesNotThrow(() => assertPoEligibleForReceipt("CONFIRMED"));
});

test("assertPoEligibleForReceipt rejects DRAFT", () => {
  assert.throws(
    () => assertPoEligibleForReceipt("DRAFT"),
    (err) => err instanceof ServiceError && err.code === "CONFLICT",
  );
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
