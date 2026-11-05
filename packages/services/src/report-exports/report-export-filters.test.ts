import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseCompanyPayableExportFilters,
  parseCompanySupplierInvoiceExportFilters,
  parsePortfolioProfitabilityExportFilters,
  parseProjectSupplierReportFilters,
} from "./report-export.service";

test("supplier invoice export defaults to ISSUED for scheduled/API callers", () => {
  assert.deepEqual(parseCompanySupplierInvoiceExportFilters({}), {
    status: "ISSUED",
  });
});

test("supplier invoice export ACTIVE matches Activas list (hides cancelled)", () => {
  assert.deepEqual(parseCompanySupplierInvoiceExportFilters({ status: "ACTIVE" }), {});
});

test("supplier invoice export accepts ALL for UI parity", () => {
  assert.deepEqual(
    parseCompanySupplierInvoiceExportFilters({
      status: "ALL",
      from: "2026-01-01",
      to: "2026-01-31",
    }),
    {
      includeCancelled: true,
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

test("portfolio export preserves the browser's devengado and certificado bases", () => {
  assert.deepEqual(parsePortfolioProfitabilityExportFilters({
    status: "ACTIVE",
    costLayer: "accrued",
    revenueBasis: "certified",
  }), { status: "ACTIVE", costLayer: "accrued", revenueBasis: "certified" });
});

test("supplier exports retain the selected currency and date range", () => {
  assert.deepEqual(parseProjectSupplierReportFilters({
    dateFrom: "2026-09-01",
    dateTo: "2026-09-30",
    currency: "USD",
  }), { dateFrom: "2026-09-01", dateTo: "2026-09-30", currency: "USD" });
});
