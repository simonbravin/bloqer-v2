import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as XLSX from "xlsx";
import { fiscalDocumentKindLabel, isFiscalDocumentKind } from "@bloqer/domain";
import { MAX_EXPORT_ROWS, MAX_PAGE_SIZE } from "../finance/pagination";
import { ServiceError, type ServiceContext } from "../types";
import {
  assertOperationalExportLimit,
  collectOperationalExportPages,
  matchesOperationalListStatus,
  normalizeOperationalListSearch,
} from "./operational-list-export-pure";
import { safeReportFilename } from "./filename.service";
import { buildXlsxSheet } from "./xlsx-export.service";
import type * as Exporters from "./operational-list-export.service";

const ctx: ServiceContext = {
  actorUserId: "actor",
  tenantId: "tenant",
  companyId: "company",
  roles: ["OWNER"],
};
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Replace service reads only; exercise production filters, mapping, paging and workbook builder. */
function exporters(overrides: Record<string, unknown> = {}): typeof Exporters {
  const exports = {};
  const dependencies: Record<string, unknown> = {
    "@bloqer/domain": { fiscalDocumentKindLabel, isFiscalDocumentKind },
    "../project/project.service": {
      getProjectShellInfo: async () => ({ code: "OB-1", name: "Obra" }),
    },
    "./operational-list-export-pure": {
      assertOperationalExportLimit,
      collectOperationalExportPages,
      matchesOperationalListStatus,
      normalizeOperationalListSearch,
    },
    "./xlsx-export.service": { buildXlsxSheet },
    "./filename.service": { safeReportFilename },
    ...overrides,
  };
  const source = readFileSync(
    new URL("./operational-list-export.service.ts", import.meta.url),
    "utf8",
  );
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  runInNewContext(code, { exports, require: (name: string) => dependencies[name] ?? {} });
  return exports as typeof Exporters;
}

test("export paging includes every row beyond100 and never asks services for oversized pages", async () => {
  const all = Array.from({ length: 237 }, (_, index) => index);
  const calls: number[] = [];
  const rows = await collectOperationalExportPages(async ({ page, pageSize }) => {
    calls.push(page);
    assert.equal(pageSize, MAX_PAGE_SIZE);
    return { data: all.slice((page - 1) * pageSize, page * pageSize), total: all.length };
  });
  assert.deepEqual(rows, all);
  assert.deepEqual(calls, [1, 2, 3]);
});

test("over-limit and concurrently changing lists fail instead of returning partial files", async () => {
  await assert.rejects(
    collectOperationalExportPages(async () => ({ data: [], total: MAX_EXPORT_ROWS + 1 })),
    { code: "CONFLICT" },
  );
  await assert.rejects(
    collectOperationalExportPages(async ({ page }) => ({
      data: page === 1 ? [1] : [2],
      total: page === 1 ? 2 : 3,
    })),
    /listado cambió/,
  );
  await assert.rejects(
    collectOperationalExportPages(async () => ({ data: [], total: 1 })),
    /listado cambió/,
  );
  assert.deepEqual(await collectOperationalExportPages(async () => ({ data: [], total: 0 })), []);
});

test("corporate exports read all invoices through company-scoped service pages", async () => {
  const calls: unknown[][] = [];
  const all = Array.from({ length: 125 }, (_, id) => ({ id: String(id) }));
  const result = await exporters({
    "../ap/supplier-invoice.service": {
      listCompanySupplierInvoices: async (
        context: ServiceContext,
        filters: { page: number; pageSize: number },
      ) => {
        assert.equal(context, ctx);
        calls.push([context, plain(filters)]);
        return {
          data: all.slice((filters.page - 1) * filters.pageSize, filters.page * filters.pageSize),
          total: all.length,
        };
      },
    },
  }).readCompanySupplierInvoicesForExport({ status: "ISSUED", documentKind: "CREDIT_NOTE" }, ctx);
  assert.equal(result.length, 125);
  assert.deepEqual(
    calls.map((call) => call[1]),
    [
      { status: "ISSUED", documentKind: "CREDIT_NOTE", page: 1, pageSize: 100 },
      { status: "ISSUED", documentKind: "CREDIT_NOTE", page: 2, pageSize: 100 },
    ],
  );
});

test("project AP filters match the screen and include all invoice pages with decimal strings", async () => {
  const calls: unknown[] = [];
  const all = Array.from({ length: 125 }, (_, index) => ({
    code: `NC-${index}`,
    documentKind: "CREDIT_NOTE",
    supplierName: "Proveedor",
    classLabel: "Compra de obra",
    issueDate: "2026-11-01",
    dueDate: null,
    status: "ISSUED",
    currency: "USD",
    totalAmount: "1234567890123.45",
    payable: null,
  }));
  const table = await exporters({
    "../ap/supplier-invoice.service": {
      listSupplierInvoicesByProject: async (
        id: string,
        context: ServiceContext,
        filters: { page: number; pageSize: number },
      ) => {
        assert.equal(id, "project");
        assert.equal(context, ctx);
        calls.push(plain(filters));
        return {
          data: all.slice((filters.page - 1) * filters.pageSize, filters.page * filters.pageSize),
          total: all.length,
        };
      },
    },
  }).buildProjectOperationalListExport(
    "project",
    "supplier-invoices",
    {
      page: "5",
      search: " NC-2 ",
      kind: "CREDIT_NOTE",
      class: "PURCHASE_PROJECT",
      status: "ISSUED",
      dir: "asc",
    },
    ctx,
  );
  assert.equal(table.rows.length, 125);
  assert.deepEqual(calls[0], {
    search: "NC-2",
    class: "PURCHASE_PROJECT",
    documentKind: "CREDIT_NOTE",
    page: 1,
    pageSize: 100,
    status: "ISSUED",
    sortDir: "asc",
  });
  assert.equal(table.rows[124]?.total, "1234567890123.45");
  assert.equal(table.rows[0]?.paymentStatus, "");
  assert.equal(table.rows[0]?.due, "");
});

test("every project kind delegates access checks to its existing service before metadata reads", async () => {
  let shellReads = 0;
  const denied = async () => {
    throw new ServiceError("FORBIDDEN", "Sin acceso");
  };
  const subject = exporters({
    "../project/project.service": {
      getProjectShellInfo: async () => {
        shellReads++;
        return {};
      },
    },
    "../ap/supplier-invoice.service": { listSupplierInvoicesByProject: denied },
    "../ar/sales-invoice.service": { listInvoicesByProject: denied },
    "../procurement/purchase-order.service": { listPurchaseOrdersByProject: denied },
    "../procurement/purchase-request.service": { listPurchaseRequestsByProject: denied },
    "../procurement/purchase-receipt.service": { listReceiptsByProject: denied },
    "../ap/payment.service": { listPaymentsByProject: denied },
    "../treasury/collection.service": { listCollectionsByProject: denied },
  });
  const kinds: Exporters.ProjectOperationalListKind[] = [
    "supplier-invoices",
    "sales-invoices",
    "purchase-orders",
    "purchase-requests",
    "purchase-receipts",
    "payments",
    "collections",
  ];
  for (const kind of kinds)
    await assert.rejects(
      subject.buildProjectOperationalListExport("foreign-project", kind, {}, ctx),
      { code: "FORBIDDEN" },
    );
  assert.equal(shellReads, 0);
});

test("procurement searches preserve UI accents, approver, request item and cancelled behavior", async () => {
  const order = {
    code: "OC-001",
    supplierName: "Acero",
    approvedByName: "José",
    issueDate: "2026-11-01",
    expectedDeliveryDate: null,
    status: "CONFIRMED",
    currency: "ARS",
    totalAmount: "100.00",
  };
  const request = {
    code: "SC-001",
    status: "SUBMITTED",
    selectedSupplierName: null,
    requestedByName: "María",
    primaryWbsNodeCode: "1",
    primaryWbsNodeName: "Pintura",
    estimatedAmount: null,
    estimatedAmountCurrency: null,
    estimatedAmountSource: null,
    neededByDate: null,
    lines: [{ description: "Látex", wbsNodeCode: "1", wbsNodeName: "Pintura" }],
  };
  const subject = exporters({
    "../procurement/purchase-order.service": {
      listPurchaseOrdersByProject: async () => [
        order,
        { ...order, code: "OC-002", status: "CANCELLED" },
      ],
    },
    "../procurement/purchase-request.service": {
      listPurchaseRequestsByProject: async () => [request],
    },
  });
  const orders = await subject.buildProjectOperationalListExport(
    "project",
    "purchase-orders",
    { search: "  jose  " },
    ctx,
  );
  assert.equal(orders.rows.length, 1);
  const cancelled = await subject.buildProjectOperationalListExport(
    "project",
    "purchase-orders",
    { status: "CANCELLED" },
    ctx,
  );
  assert.equal(cancelled.rows[0]?.code, "OC-002");
  const requests = await subject.buildProjectOperationalListExport(
    "project",
    "purchase-requests",
    { search: "latex" },
    ctx,
  );
  assert.equal(requests.rows.length, 1);
  assert.equal(requests.rows[0]?.amount, "");
  assert.equal(requests.rows[0]?.currency, "");
});

test("XLSX encodes formula-like contact names as literal cells and preserves money strings", async () => {
  const result = await exporters({
    "../ar/sales-invoice.service": {
      listInvoicesByProject: async () => ({
        total: 1,
        data: [
          {
            code: "FAC-001",
            clientName: '=HYPERLINK("https://example.test")',
            documentKind: "INVOICE",
            classLabel: "Venta",
            issueDate: "2026-11-01",
            dueDate: "2026-12-01",
            status: "DRAFT",
            currency: "ARS",
            totalAmount: "9007199254740991.99",
          },
        ],
      }),
    },
  }).exportProjectOperationalListXlsx("project", "sales-invoices", {}, ctx);
  assert.equal(result.filename, "facturas_emitidas_OB-1.xlsx");
  const workbook = XLSX.read(result.buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;
  const cells = Object.values(sheet) as { v?: unknown; t?: string; f?: string }[];
  const formulaLike = cells.find((cell) => cell?.v === '=HYPERLINK("https://example.test")');
  assert.equal(formulaLike?.t, "s");
  assert.equal(formulaLike?.f, undefined);
  assert.ok(cells.some((cell) => cell?.v === "9007199254740991.99" && cell.t === "s"));
});

test("historical receipt identity is retained without inventing a number", async () => {
  const table = await exporters({
    "../procurement/purchase-receipt.service": {
      listReceiptsByProject: async () => [
        {
          number: null,
          code: "Recepción histórica 967cae60-6674-42be-abec-6159022ff859",
          purchaseOrderCode: "OC-001",
          supplierName: "Proveedor",
          receiptDate: "2026-11-01",
          status: "CONFIRMED",
          receivedByName: null,
          lines: [],
        },
      ],
    },
  }).buildProjectOperationalListExport("project", "purchase-receipts", {}, ctx);
  assert.equal(table.rows[0]?.code, "Recepción histórica 967cae60-6674-42be-abec-6159022ff859");
  assert.equal(table.rows[0]?.receivedBy, "");
});
