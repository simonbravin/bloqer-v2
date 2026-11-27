import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Execute the real HTTP handler with fake boundaries. No auth store, DB, provider or network.
class FakeServiceError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
class FakeProviderError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
type PreviewInput = { projectId: string; purchaseRequestId: string; mimeType: string; bytes: Uint8Array; signal: AbortSignal };
const MAX_FILE = 3 * 1024 * 1024;

function loadRoute() {
  const context = { tenantId: "session-tenant", actorUserId: "session-actor", companyId: "session-company", roles: ["OWNER"] };
  const state = {
    signedIn: true, enabled: true, quota: true, error: null as Error | null,
    calls: [] as Array<{ input: PreviewInput; context: unknown }>,
    capabilityCalls: 0, rateCalls: [] as unknown[],
  };
  const dependencies: Record<string, unknown> = {
    "@bloqer/ai": {
      AiProviderError: FakeProviderError,
      SUPPLIER_INVOICE_PREVIEW_MAX_BYTES: MAX_FILE,
      userFacingAiProviderErrorMessage: () => "No se pudo completar la lectura.",
    },
    "@bloqer/services": {
      ServiceError: FakeServiceError,
      procurementQuoteDocumentAvailable: () => { state.capabilityCalls += 1; return state.enabled; },
      previewProcurementQuoteDocument: async (input: PreviewInput, ctx: unknown) => {
        state.calls.push({ input, context: ctx });
        if (state.error) throw state.error;
        return { canApply: false, blockingReasons: ["Fixture"], warnings: [] };
      },
    },
    "@/lib/tenant-service-context": { buildTenantServiceContext: async () => state.signedIn ? context : null },
    "@/lib/ai-rate-limit": {
      AI_RATE_LIMIT_USER_MESSAGE: "Límite de prueba",
      checkAiChatRateLimit: (input: unknown) => { state.rateCalls.push(input); return state.quota ? { ok: true } : { ok: false, retryAfterSec: 7 }; },
    },
  };
  const code = ts.transpileModule(readFileSync(new URL("../../../app/api/ai/procurement-quote-preview/route.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  runInNewContext(code, {
    exports, Response, Request, File, FormData, URL, Buffer, Uint8Array,
    require(name: string) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`);
      return dependencies[name];
    },
  });
  return { state, context, ...exports as { GET: () => Promise<Response>; POST: (req: Request) => Promise<Response> } };
}

function formRequest(options: { projectId?: string; origin?: string; extra?: string; duplicateFile?: boolean; mimeType?: string } = {}) {
  const form = new FormData();
  const file = new File(["%PDF-1.4\nSYNTHETIC TEST ONLY\n%%EOF"], "fixture.pdf", { type: options.mimeType ?? "application/pdf" });
  form.append("file", file);
  if (options.duplicateFile) form.append("file", file);
  form.append("projectId", options.projectId ?? "project");
  form.append("purchaseRequestId", "request");
  if (options.extra) form.append(options.extra, "untrusted");
  return new Request("https://bloqer.test/api/ai/procurement-quote-preview", {
    method: "POST", body: form, headers: { Origin: options.origin ?? "https://bloqer.test" },
  });
}

describe("procurement quote preview HTTP boundary (mocked dependencies)", () => {
  it("requires authentication for GET and POST without consulting capabilities or preview", async () => {
    const route = loadRoute();
    route.state.signedIn = false;
    assert.equal((await route.GET()).status, 401);
    assert.equal((await route.POST(formRequest())).status, 401);
    assert.equal(route.state.capabilityCalls, 0);
    assert.equal(route.state.calls.length, 0);
  });

  it("returns a noncached capability only and blocks disabled POST before parsing", async () => {
    const route = loadRoute();
    route.state.enabled = false;
    const response = await route.GET();
    assert.deepEqual(await response.json(), { enabled: false });
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal((await route.POST(formRequest())).status, 503);
    assert.equal(route.state.calls.length, 0);
    assert.equal(route.state.rateCalls.length, 0);
  });

  it("rejects foreign origins and cross-site requests before any provider capability check", async () => {
    const route = loadRoute();
    assert.equal((await route.POST(formRequest({ origin: "https://evil.test" }))).status, 403);
    const request = formRequest();
    request.headers.set("sec-fetch-site", "cross-site");
    assert.equal((await route.POST(request)).status, 403);
    assert.equal(route.state.capabilityCalls, 0);
    assert.equal(route.state.calls.length, 0);
  });

  it("shares the session tenant/user quota and returns Retry-After", async () => {
    const route = loadRoute();
    route.state.quota = false;
    const response = await route.POST(formRequest());
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("retry-after"), "7");
    assert.deepEqual(JSON.parse(JSON.stringify(route.state.rateCalls)), [{ tenantId: route.context.tenantId, userId: route.context.actorUserId }]);
    assert.equal(route.state.calls.length, 0);
  });

  it("passes only file bytes, MIME and selected project with session context to the service", async () => {
    const route = loadRoute();
    for (const projectId of ["00000000-0000-0000-0000-000000000001"]) {
      const response = await route.POST(formRequest({ projectId }));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      const call = route.state.calls.at(-1)!;
      assert.equal(call.context, route.context);
      assert.equal(call.input.projectId, projectId);
      assert.equal(call.input.purchaseRequestId, "request");
      assert.equal(call.input.mimeType, "application/pdf");
      assert.match(Buffer.from(call.input.bytes).toString(), /SYNTHETIC TEST ONLY/);
      assert.deepEqual(Object.keys(call.input).sort(), ["bytes", "mimeType", "projectId", "purchaseRequestId", "signal"]);
    }
  });

  it("rejects unexpected fields, duplicate/missing files, nonmultipart and malformed bodies", async () => {
    const route = loadRoute();
    const missing = new Request("https://bloqer.test/api/ai/procurement-quote-preview", { method: "POST", body: new FormData() });
    const plain = new Request("https://bloqer.test/api/ai/procurement-quote-preview", { method: "POST", body: "plain" });
    const malformed = new Request("https://bloqer.test/api/ai/procurement-quote-preview", { method: "POST", body: "invalid multipart", headers: { "Content-Type": "multipart/form-data; boundary=test" } });
    for (const request of [formRequest({ extra: "tenantId" }), formRequest({ extra: "purchaseRequestId" }), formRequest({ extra: "projectId" }), formRequest({ duplicateFile: true }), missing, plain, malformed]) {
      assert.equal((await route.POST(request)).status, 400);
    }
    assert.equal(route.state.calls.length, 0);
  });

  it("bounds oversized bodies both with and without Content-Length before parsing", async () => {
    const route = loadRoute();
    for (const withLength of [false, true]) {
      const body = Buffer.alloc(MAX_FILE + 64 * 1024 + 1);
      const request = new Request("https://bloqer.test/api/ai/procurement-quote-preview", {
        method: "POST", body, headers: { "Content-Type": "multipart/form-data; boundary=test", ...(withLength ? { "Content-Length": String(body.length) } : {}) },
      });
      assert.equal((await route.POST(request)).status, 400);
    }
    assert.equal(route.state.calls.length, 0);
  });

  it("maps service ACL/schema/MIME errors and never echoes provider/internal payloads", async () => {
    const route = loadRoute();
    for (const [code, status] of [["FORBIDDEN", 403], ["NOT_FOUND", 404], ["VALIDATION", 400]] as const) {
      route.state.error = new FakeServiceError(code, "No se puede leer este comprobante.");
      const response = await route.POST(formRequest({ mimeType: "text/html" }));
      assert.equal(response.status, status);
    }
    route.state.error = new FakeProviderError("BAD_REQUEST", "SECRET_PROVIDER_PAYLOAD");
    const providerResponse = await route.POST(formRequest());
    assert.equal(providerResponse.status, 502);
    assert.doesNotMatch(await providerResponse.text(), /SECRET_PROVIDER_PAYLOAD/);
    route.state.error = new Error("SECRET_INTERNAL_PAYLOAD");
    const internalResponse = await route.POST(formRequest());
    assert.equal(internalResponse.status, 500);
    assert.doesNotMatch(await internalResponse.text(), /SECRET_INTERNAL_PAYLOAD/);
  });
});

