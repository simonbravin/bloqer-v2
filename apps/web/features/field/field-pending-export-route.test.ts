import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function loadRoute() {
  const ctx = { tenantId: "tenant-a", companyId: "company-a", actorUserId: "user-a", roles: ["WAREHOUSE"] };
  const state = { signedIn: true, denied: false, query: { format: "csv", proyecto: "project-a", search: "acero", overdue: "1" } };
  const calls: string[] = [];
  const check = (params: unknown, context: unknown, format: string) => {
    assert.equal(params, state.query); assert.equal(context, ctx); calls.push(format);
    if (state.denied) throw new Error("Sin permiso");
  };
  const dependencies: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, options: { status: number }) => ({ body, status: options.status }) } },
    "@bloqer/services": { exportFieldPendingData: async (format: string, params: unknown, context: unknown) => {
      check(params, context, format);
      return format === "csv" ? { content: "csv", filename: "pendientes.csv" } : { buffer: Buffer.from("xlsx"), filename: "pendientes.xlsx" };
    } },
    "@bloqer/report-pdf": { exportFieldPendingPdf: async (params: unknown, context: unknown) => {
      check(params, context, "pdf"); return { buffer: Buffer.from("pdf"), filename: "pendientes.pdf" };
    } },
    "@/lib/report-export-http": {
      requireReportExportContext: async () => state.signedIn ? { ok: true, ctx } : { ok: false, response: { status: 401 } },
      searchParamsRecord: () => state.query,
      ...Object.fromEntries(["csv", "xlsx", "pdf"].map((format) => [`${format}Response`, (_data: unknown, filename: string) => ({ status: 200, format, filename })])),
      reportExportErrorResponse: (error: Error) => ({ status: 403, message: error.message }),
    },
  };
  const source = readFileSync(new URL("../../app/api/reports/pendientes/route.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  runInNewContext(code, { exports, require(name: string) { assert.ok(name in dependencies, name); return dependencies[name]; } });
  const get = (exports as { GET: (req: unknown) => Promise<{ status: number; format: string; filename: string }> }).GET;
  return { state, calls, get: () => get({}) };
}

test("pending route dispatches all formats with session scope and filters", async () => {
  const route = loadRoute();
  for (const format of ["csv", "xlsx", "pdf"]) {
    route.state.query.format = format;
    const response = await route.get();
    assert.equal(response.status, 200); assert.equal(response.format, format);
    assert.equal(response.filename, `pendientes.${format}`);
  }
  assert.deepEqual(route.calls, ["csv", "xlsx", "pdf"]);
});

test("pending route blocks anonymous and unsupported requests before reads and handles denied access", async () => {
  const route = loadRoute();
  route.state.signedIn = false;
  assert.equal((await route.get()).status, 401);
  route.state.signedIn = true; route.state.query.format = "html";
  assert.equal((await route.get()).status, 400);
  assert.equal(route.calls.length, 0);
  route.state.query.format = "csv"; route.state.denied = true;
  assert.equal((await route.get()).status, 403);
});
