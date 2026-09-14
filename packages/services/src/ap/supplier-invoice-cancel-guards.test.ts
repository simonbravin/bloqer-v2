import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@bloqer/database";
import { ServiceError } from "../types";
import { assertCanCancelSupplierInvoice } from "./supplier-invoice-cancel-guards";

test("assertCanCancelSupplierInvoice skips guard for DRAFT", () => {
  assert.doesNotThrow(() =>
    assertCanCancelSupplierInvoice({
      status: "DRAFT",
      hasPayable: false,
      activePaymentCount: 3,
      payablePaidAmount: new Prisma.Decimal(50),
    }),
  );
});

test("assertCanCancelSupplierInvoice rejects missing payable on ISSUED", () => {
  assert.throws(
    () =>
      assertCanCancelSupplierInvoice({
        status: "ISSUED",
        hasPayable: false,
        activePaymentCount: 0,
        payablePaidAmount: null,
      }),
    (e: unknown) => e instanceof ServiceError && e.code === "CONFLICT",
  );
});

test("assertCanCancelSupplierInvoice rejects confirmed payments", () => {
  assert.throws(
    () =>
      assertCanCancelSupplierInvoice({
        status: "ISSUED",
        hasPayable: true,
        activePaymentCount: 1,
        payablePaidAmount: new Prisma.Decimal(0),
      }),
    (e: unknown) => e instanceof ServiceError && e.code === "CONFLICT",
  );
});

test("assertCanCancelSupplierInvoice rejects CREDIT_NOTE ([D-115])", () => {
  assert.throws(
    () =>
      assertCanCancelSupplierInvoice({
        status: "DRAFT",
        documentKind: "CREDIT_NOTE",
        hasPayable: false,
        activePaymentCount: 0,
        payablePaidAmount: null,
      }),
    (e: unknown) => e instanceof ServiceError && e.code === "VALIDATION",
  );
});

test("assertCanCancelSupplierInvoice rejects active NC/ND ([BR-NC-005])", () => {
  assert.throws(
    () =>
      assertCanCancelSupplierInvoice({
        status: "ISSUED",
        documentKind: "INVOICE",
        hasPayable: true,
        activePaymentCount: 0,
        payablePaidAmount: new Prisma.Decimal(0),
        payableCreditedAmount: new Prisma.Decimal(0),
        activeCreditDebitNoteCount: 1,
      }),
    (e: unknown) => e instanceof ServiceError && e.code === "CONFLICT",
  );
});

test("assertCanCancelSupplierInvoice rejects creditedAmount ([D-115])", () => {
  assert.throws(
    () =>
      assertCanCancelSupplierInvoice({
        status: "ISSUED",
        documentKind: "INVOICE",
        hasPayable: true,
        activePaymentCount: 0,
        payablePaidAmount: new Prisma.Decimal(0),
        payableCreditedAmount: new Prisma.Decimal(10),
      }),
    (e: unknown) => e instanceof ServiceError && e.code === "CONFLICT",
  );
});
