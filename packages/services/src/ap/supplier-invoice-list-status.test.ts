import assert from "node:assert/strict";
import { test } from "node:test";
import { supplierInvoiceListStatusWhere } from "./supplier-invoice-list-status";

test("supplier invoice list status defaults to hiding CANCELLED", () => {
  assert.deepEqual(supplierInvoiceListStatusWhere(undefined), {
    status: { not: "CANCELLED" },
  });
  assert.deepEqual(supplierInvoiceListStatusWhere({}), {
    status: { not: "CANCELLED" },
  });
});

test("supplier invoice list status exact match when set", () => {
  assert.deepEqual(supplierInvoiceListStatusWhere({ status: "CANCELLED" }), {
    status: "CANCELLED",
  });
  assert.deepEqual(supplierInvoiceListStatusWhere({ status: "DRAFT" }), {
    status: "DRAFT",
  });
});

test("supplier invoice list includeCancelled returns no status clause", () => {
  assert.deepEqual(supplierInvoiceListStatusWhere({ includeCancelled: true }), {});
});
