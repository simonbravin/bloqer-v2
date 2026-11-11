import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

type RouteResponse = { status: number; body?: unknown; format?: string; filename?: string };
type ExportCall = { format: string; args: unknown[] };

function loadRoute(path: string) {
  const calls: ExportCall[] = [];
  const ctx = { tenantId: "tenant", companyId: "company", actorUserId: "actor", roles: ["OWNER"] };
  const state = { signedIn: true, query: { format: "xlsx", search: "Acero", status: "DRAFT", class: "FISCAL", kind: "CREDIT_NOTE" } as Record<string, string>, error: null as Error | null };
  const exporter = (format: string) => async (...args: unknown[]) => {
    calls.push({ format, args });
    if (state.error) throw state.error;
    return { buffer: new Uint8Array([1, 2]), filename: `listado.${format}` };
  };
  const dependencies: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, options: { status: number }) => ({ body, status: options.status }) } },
    "@bloqer/services": {
      exportProjectOperationalListXlsx: exporter("xlsx"),
      exportCompanySupplierInvoicesXlsx: exporter("xlsx"),
      parseCompanySupplierInvoiceExportFilters: (query: unknown) => query,
    },
    "@bloqer/report-pdf": { exportProjectOperationalListPdf: exporter("pdf") },
    "@/lib/report-export-http": {
      requireReportExportContext: async () => state.signedIn ? { ok: true, ctx } : { ok: false, response: { status: 401 } },
      searchParamsRecord: () => state.query,
      xlsxResponse: (_buffer: unknown, filename: string) => ({ status: 200, format: "xlsx", filename }),
      pdfResponse: (_buffer: unknown, filename: string) => ({ status: 200, format: "pdf", filename }),
      reportExportErrorResponse: (error: Error) => ({ status: 403, body: error.message }),
    },
  };
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  runInNewContext(code, { exports, require(name: string) { assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`); return dependencies[name]; } });
  const get = (exports as { GET: (req: unknown, context: unknown) => Promise<RouteResponse> }).GET;
  return { state, calls, ctx, get: (listKind = "facturas-proveedor") => get({}, { params: Promise.resolve({ projectId: "project", listKind }) }) };
}

const projectRoute = "../../app/api/proyectos/[projectId]/[listKind]/export/route.ts";

test("all operational list routes export both formats with the authenticated scope and current filters", async () => {
  const route = loadRoute(projectRoute);
  const kinds = {
    "facturas-proveedor": "supplier-invoices", facturas: "sales-invoices",
    "ordenes-compra": "purchase-orders", "solicitudes-compra": "purchase-requests",
    recepciones: "purchase-receipts", pagos: "payments", cobranzas: "collections",
  };
  for (const [segment, kind] of Object.entries(kinds)) {
    for (const format of ["xlsx", "pdf"]) {
      route.state.query.format = format;
      const response = await route.get(segment);
      assert.equal(response.status, 200);
      assert.equal(response.format, format);
      assert.equal(response.filename, `listado.${format}`);
      const call = route.calls.at(-1)!;
      assert.equal(call.format, format);
      assert.equal(call.args[0], "project");
      assert.equal(call.args[1], kind);
      assert.equal(call.args[2], route.state.query);
      assert.equal(call.args[3], route.ctx);
    }
  }
});

test("anonymous, unknown-list and unsupported-format requests never read list data", async () => {
  const route = loadRoute(projectRoute);
  route.state.signedIn = false;
  assert.equal((await route.get()).status, 401);
  route.state.signedIn = true;
  for (const kind of ["unknown", "__proto__", "constructor"]) assert.equal((await route.get(kind)).status, 404);
  for (const format of ["json", "csv", "html"]) {
    route.state.query.format = format;
    assert.equal((await route.get()).status, 400);
  }
  assert.equal(route.calls.length, 0);
});

test("service permission errors return the common export error response", async () => {
  const route = loadRoute(projectRoute);
  route.state.error = new Error("Sin permiso para consultar esta obra");
  const response = await route.get();
  assert.equal(response.status, 403);
  assert.equal(response.body, route.state.error.message);
});

test("corporate supplier invoices support Excel through the existing filtered export route", async () => {
  const route = loadRoute("../../app/api/reports/finanzas/facturas-proveedor-corporativo.csv/route.ts");
  const response = await route.get();
  assert.equal(response.format, "xlsx");
  assert.equal(route.calls[0]?.args[0], route.state.query);
  assert.equal(route.calls[0]?.args[1], route.ctx);
});
