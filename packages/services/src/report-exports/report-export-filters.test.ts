import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseCompanyPayableExportFilters,
  parseCompanySupplierInvoiceExportFilters,
} from "./report-export.service";

test("supplier invoice export defaults to ISSUED for scheduled/API callers", () => {
  assert.deepEqual(parseCompanySupplierInvoiceExportFilters({}), {
    status: "ISSUED",
  });
});

test("supplier invoice export accepts ALL for UI parity", () => {
  assert.deepEqual(
    parseCompanySupplierInvoiceExportFilters({
      status: "ALL",
      from: "2026-01-01",
      to: "2026-01-31",
    }),
    {
      status: undefined,
      issueDateFrom: "2026-01-01",
      issueDateTo: "2026-01-31",
    },
  );
});

test("payable export accepts ALL without pending-only fallback", () => {
  assert.deepEqual(parseCompanyPayableExportFilters({ status: "ALL" }), {
    status: undefined,
    pendingOnly: false,
  });
});
