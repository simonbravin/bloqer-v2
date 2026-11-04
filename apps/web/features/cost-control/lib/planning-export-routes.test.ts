import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

for (const [path, reader] of [["control-costos.csv", "getProjectCostControl"], ["materiales.csv", "getMaterialVarianceReport"], ["recursos.csv", "getResourceVarianceReport"]]) {
  test(`${path} JSON is private and uncached, uses the authorized context and denies anonymous reads`, async () => {
    const calls: unknown[][] = [];
    let signedIn = true;
    const context = { tenantId: "tenant", companyId: "company", actorUserId: "actor", roles: ["OWNER"] };
    const data = { type: "REPORT", currency: "USD" };
    const dependencies: Record<string, unknown> = {
      "next/server": { NextResponse: { json: (body: unknown, options: unknown) => ({ body, options }) } },
      "@bloqer/services": {
        [reader!]: async (...args: unknown[]) => { calls.push(args); return data; },
        parseCostControlFilters: (value: unknown) => value,
        parseProjectReportDateFilters: (value: unknown) => value,
        isResourceBoardCategory: (value: string) => value === "LABOR",
      },
      "@bloqer/report-pdf": {},
      "@/lib/report-export-http": {
        requireReportExportContext: async () => signedIn ? { ok: true, ctx: context } : { ok: false, response: { status: 401 } },
        searchParamsRecord: () => ({ format: "json", costCategory: "LABOR" }),
      },
    };
    const code = ts.transpileModule(readFileSync(new URL(`../../../app/api/reports/proyectos/[projectId]/${path}/route.ts`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
    const exports = {};
    runInNewContext(code, { exports, require(name: string) { assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`); return dependencies[name]; } });
    const route = (exports as { GET: (request: unknown, params: unknown) => Promise<{ body?: unknown; options?: { headers?: Record<string, string> }; status?: number }> }).GET;
    const response = await route({}, { params: Promise.resolve({ projectId: "project" }) });
    assert.equal(response.body, data);
    assert.equal(response.options?.headers?.["Cache-Control"], "private, no-store");
    assert.equal(calls[0]![0], "project");
    assert.equal(calls[0]!.at(-1), context);
    signedIn = false;
    assert.equal((await route({}, { params: Promise.resolve({ projectId: "project" }) })).status, 401);
    assert.equal(calls.length, 1);
  });
}
