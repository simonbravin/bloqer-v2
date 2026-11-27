import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

class ServiceError extends Error { constructor(public code: string, message: string) { super(message); } }

function fixture(suffix: "history/export" | "integrity" | "versions") {
  const ctx = { tenantId: "tenant", companyId: "company", roles: ["OWNER"] };
  const state = { signedIn: true, id: "00000000-0000-4000-8000-000000000001", error: null as Error | null, calls: [] as unknown[][] };
  const run = async (...args: unknown[]) => { state.calls.push(args); if (state.error) throw state.error; return suffix === "integrity" ? { checksumVerified: true } : "csv"; };
  class NextResponse extends Response { static json(body: unknown, init?: ResponseInit) { return new NextResponse(JSON.stringify(body), { ...init, headers: { ...init?.headers, "Content-Type": "application/json" } }); } }
  const dependencies: Record<string, unknown> = {
    "next/server": { NextResponse },
    "@bloqer/services": { exportDocumentHistory: run, verifyStoredDocument: run, getDocumentVersionLinks: run, ServiceError },
    "@bloqer/utils": { isUuid: (id: string) => /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id) },
    "@/lib/auth": { getCurrentUser: async () => state.signedIn ? { session: { user: { id: "actor" } }, tenantCtx: ctx } : null },
  };
  const code = ts.transpileModule(readFileSync(new URL(`../../../app/api/documents/[documentId]/${suffix}/route.ts`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports: { GET?: (req: unknown, params: unknown) => Promise<Response> } = {};
  runInNewContext(code, { exports, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; } });
  return { state, get: () => exports.GET!({}, { params: Promise.resolve({ documentId: state.id }) }) };
}

for (const suffix of ["history/export", "integrity", "versions"] as const) {
  test(`${suffix}: authenticated context only, private success and no upload URL`, async () => {
    const f = fixture(suffix);
    const response = await f.get();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("vary"), "Cookie");
    assert.deepEqual(JSON.parse(JSON.stringify(f.state.calls[0])), [f.state.id, { actorUserId: "actor", tenantId: "tenant", companyId: "company", roles: ["OWNER"] }]);
    if (suffix === "history/export") assert.match(response.headers.get("content-disposition")!, /^attachment; filename="historial-[\da-f-]+\.csv"$/);
  });
  test(`${suffix}: anonymous and invalid identities never invoke the service`, async () => {
    const f = fixture(suffix);
    f.state.signedIn = false;
    assert.equal((await f.get()).status, 401);
    f.state.signedIn = true;
    f.state.id = "../foreign";
    assert.equal((await f.get()).status, 404);
    assert.equal(f.state.calls.length, 0);
  });
  test(`${suffix}: failures are private, accurate and never disclose provider details`, async () => {
    for (const [code, status] of [["FORBIDDEN", 403], ["NOT_FOUND", 404], ["CONFLICT", 409], ["VALIDATION", 400]] as const) {
      const f = fixture(suffix);
      f.state.error = new ServiceError(code, "Acceso rechazado");
      const response = await f.get();
      assert.equal(response.status, status);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.equal(response.headers.get("content-disposition"), null);
    }
    const f = fixture(suffix);
    f.state.error = new Error("private-bucket/key credential");
    const response = await f.get();
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /private-bucket|credential/);
  });
}
