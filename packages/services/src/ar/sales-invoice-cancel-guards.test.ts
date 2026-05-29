import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@bloqer/database";
import { ServiceError } from "../types";
import { assertCanCancelSalesInvoice } from "./sales-invoice-cancel-guards";

test("assertCanCancelSalesInvoice skips guard for DRAFT", () => {
  assert.doesNotThrow(() =>
    assertCanCancelSalesInvoice({
      status: "DRAFT",
      hasReceivable: false,
      activeCollectionCount: 5,
      receivablePaidAmount: new Prisma.Decimal(100),
    }),
  );
});

test("assertCanCancelSalesInvoice rejects missing receivable on ISSUED", () => {
  assert.throws(
    () =>
      assertCanCancelSalesInvoice({
        status: "ISSUED",
        hasReceivable: false,
        activeCollectionCount: 0,
        receivablePaidAmount: null,
      }),
    (e: unknown) => e instanceof ServiceError && e.code === "CONFLICT",
  );
});

test("assertCanCancelSalesInvoice rejects confirmed collections", () => {
  assert.throws(
    () =>
      assertCanCancelSalesInvoice({
        status: "ISSUED",
        hasReceivable: true,
        activeCollectionCount: 1,
        receivablePaidAmount: new Prisma.Decimal(0),
      }),
    (e: unknown) => e instanceof ServiceError && e.code === "CONFLICT",
  );
});

test("assertCanCancelSalesInvoice rejects paidAmount > 0", () => {
  assert.throws(
    () =>
      assertCanCancelSalesInvoice({
        status: "ISSUED",
        hasReceivable: true,
        activeCollectionCount: 0,
        receivablePaidAmount: new Prisma.Decimal("50.0000"),
      }),
    (e: unknown) => e instanceof ServiceError && e.code === "CONFLICT",
  );
});

test("assertCanCancelSalesInvoice allows ISSUED with no collections and zero paid", () => {
  assert.doesNotThrow(() =>
    assertCanCancelSalesInvoice({
      status: "ISSUED",
      hasReceivable: true,
      activeCollectionCount: 0,
      receivablePaidAmount: new Prisma.Decimal(0),
    }),
  );
});
