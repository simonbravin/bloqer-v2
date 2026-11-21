import assert from "node:assert/strict";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";

type Response = { status: number; body: { ok?: boolean; error?: string }; headers: Record<string, string> };
type Handler = (request: unknown) => Promise<Response>;

function fixture(slug: string, prefix: string) {
  const token = randomBytes(24).toString("hex");
  const state = { secret: token as string | undefined, ok: true, fail: false };
  const calls: { kind: string; args: unknown[] }[] = [];
  const bridge = () => undefined;
  const services = Object.fromEntries(["AllActiveTenants", "Tenant"].map((kind) => [
    `run${prefix}For${kind}`, async (...args: unknown[]) => {
      calls.push({ kind, args });
      if (state.fail) throw new Error("private provider token must not escape");
      return { ok: state.ok, errors: state.ok ? 0 : 1 };
    },
  ]));
  const dependencies: Record<string, unknown> = {
    "node:crypto": { timingSafeEqual }, zod: { z },
    "next/server": { NextResponse: { json: (body: Response["body"], options: Omit<Response, "body">) => ({ ...options, body }) } },
    "@bloqer/config": { getOperationalAlertsCronSecret: () => state.secret },
    "@bloqer/services": services,
    "@/lib/scheduled-report-attachment-bridge": { buildScheduledReportAttachment: bridge },
  };
  function load(path: string) {
    const exports: Record<string, Handler> = {};
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
    runInNewContext(code, { exports, Buffer, console: { error() {} }, require(name: string) {
      assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name];
    } });
    return exports;
  }
  dependencies["@/lib/cron-request"] = load("./cron-request.ts");
  const route = load(`../app/api/cron/${slug}/route.ts`);
  return { token, state, calls, bridge, run: (query = "", headers: Record<string, string> = { authorization: `Bearer ${token}` }, method = "GET") =>
    route[method]!({ headers: new Headers(headers), nextUrl: new URL(`https://example.invalid/api/cron/${slug}${query}`) }) };
}

for (const [slug, prefix] of [["notification-digest", "NotificationDigest"], ["operational-alerts", "OperationalAlerts"], ["scheduled-reports", "ScheduledReports"]]) {
  test(`${slug}: rejects unauthenticated, conflicting and unconfigured requests without executing`, async () => {
    const f = fixture(slug!, prefix!);
    for (const headers of [{}, { authorization: "Bearer bad", "x-cron-secret": f.token }, { authorization: "Bearer " }, { authorization: `Bearer ${"x".repeat(f.token.length)}` }]) {
      const result = await f.run("", headers as Record<string, string>);
      assert.equal(result.status, 401);
      assert.equal(result.headers["Cache-Control"], "private, no-store");
    }
    f.state.secret = undefined;
    assert.equal((await f.run()).status, 503);
    assert.equal(f.calls.length, 0);
  });
  test(`${slug}: invalid/empty/repeated tenant never broadens to all tenants`, async () => {
    const f = fixture(slug!, prefix!);
    for (const query of ["?tenantId=", "?tenantId=invalid", "?tenantId=00000000-0000-4000-8000-000000000001&tenantId=00000000-0000-4000-8000-000000000002"]) {
      assert.equal((await f.run(query)).status, 400);
    }
    assert.equal(f.calls.length, 0);
  });
  test(`${slug}: GET and POST preserve explicit scope and attachment bridge`, async () => {
    const f = fixture(slug!, prefix!);
    const id = "00000000-0000-4000-8000-000000000001";
    assert.equal((await f.run(`?tenantId=${id}`, { "x-cron-secret": f.token }, "POST")).status, 200);
    assert.equal(f.calls[0]?.kind, "Tenant");
    assert.equal(f.calls[0]?.args[0], id);
    if (slug === "scheduled-reports") assert.equal(f.calls[0]?.args[1], f.bridge);
    assert.equal((await f.run()).status, 200);
    assert.equal(f.calls[1]?.kind, "AllActiveTenants");
    if (slug === "scheduled-reports") assert.equal(f.calls[1]?.args[0], f.bridge);
  });
  test(`${slug}: partial failures and exceptions are visible as HTTP 500 without leaking errors`, async () => {
    const f = fixture(slug!, prefix!);
    f.state.ok = false;
    const partial = await f.run();
    assert.equal(partial.status, 500);
    assert.equal(partial.body.ok, false);
    f.state.fail = true;
    const failed = await f.run("?tenantId=00000000-0000-4000-8000-000000000001");
    assert.equal(failed.status, 500);
    assert.equal(failed.body.error, "cron_failed");
    assert.doesNotMatch(JSON.stringify(failed.body), /private|provider|token must/);
  });
}
