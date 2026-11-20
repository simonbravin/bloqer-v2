import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function route() {
  const ctx = { tenantId: "tenant", companyId: "company", actorUserId: "user", roles: ["OWNER"] };
  const calls: unknown[][] = [];
  const state = { signedIn: true, format: "pdf", denied: false };
  const dependencies: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, options: { status: number }) => ({ status: options.status, body }) } },
    "@bloqer/report-pdf": { exportPurchaseOrderPdf: async (...args: unknown[]) => {
      calls.push(args);
      if (state.denied) throw new Error("Sin permiso para la orden");
      return { buffer: Buffer.from("pdf"), filename: "OC-048_Empresa.pdf" };
    } },
    "@/lib/report-export-http": {
      requireReportExportContext: async () => state.signedIn ? { ok: true, ctx } : { ok: false, response: { status: 401 } },
      searchParamsRecord: () => ({ format: state.format }),
      pdfResponse: (_buffer: Buffer, filename: string) => ({ status: 200, filename }),
      reportExportErrorResponse: () => ({ status: 403 }),
    },
  };
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL("../../../app/api/reports/proyectos/[projectId]/ordenes-compra/[purchaseOrderId]/export/route.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(code, { exports, require(name: string) { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name]; } });
  const get = (exports as { GET: (req: unknown, context: unknown) => Promise<{ status: number; filename?: string }> }).GET;
  return { ctx, state, calls, get: () => get({}, { params: Promise.resolve({ projectId: "project", purchaseOrderId: "po" }) }) };
}

test("individual PO export forwards only authenticated scope and document/project identity", async () => {
  const loaded = route();
  const result = await loaded.get();
  assert.equal(result.status, 200);
  assert.equal(result.filename, "OC-048_Empresa.pdf");
  assert.equal(loaded.calls[0]?.[0], "po");
  assert.equal(loaded.calls[0]?.[1], "project");
  assert.equal(loaded.calls[0]?.[2], loaded.ctx);
});

test("anonymous and unsupported-format requests do not invoke PO export", async () => {
  const loaded = route();
  loaded.state.signedIn = false;
  assert.equal((await loaded.get()).status, 401);
  loaded.state.signedIn = true;
  loaded.state.format = "html";
  assert.equal((await loaded.get()).status, 400);
  assert.equal(loaded.calls.length, 0);
});

test("authorization failure from document service is returned as the common error response", async () => {
  const loaded = route();
  loaded.state.denied = true;
  assert.equal((await loaded.get()).status, 403);
});
