import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@bloqer/database";
import { ServiceError } from "../types";
import { assertCanCancelPayableDirect } from "./payable-cancel-guards";

test("assertCanCancelPayableDirect rejects ISSUED invoice", () => {
  assert.throws(
    () => assertCanCancelPayableDirect({ supplierInvoiceStatus: "ISSUED", activePaymentCount: 0, paidAmount: new Prisma.Decimal(0) }),
    (e: unknown) => e instanceof ServiceError && e.code === "CONFLICT",
  );
});

test("assertCanCancelPayableDirect rejects confirmed payments", () => {
  assert.throws(
    () => assertCanCancelPayableDirect({ supplierInvoiceStatus: "CANCELLED", activePaymentCount: 1, paidAmount: new Prisma.Decimal(0) }),
    (e: unknown) => e instanceof ServiceError && e.code === "CONFLICT",
  );
});

test("assertCanCancelPayableDirect allows when invoice cancelled and clean", () => {
  assert.doesNotThrow(() =>
    assertCanCancelPayableDirect({ supplierInvoiceStatus: "CANCELLED", activePaymentCount: 0, paidAmount: new Prisma.Decimal(0) }),
  );
});
