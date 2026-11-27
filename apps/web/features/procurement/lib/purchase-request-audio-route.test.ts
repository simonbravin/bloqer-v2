import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

class ServiceError extends Error { constructor(public code: string, message: string) { super(message); } }
class ProviderError extends Error { constructor(public code: string, message: string) { super(message); } }
const endpoint = "https://bloqer.test/api/ai/purchase-request-audio";
function fixture() {
  const ctx = { tenantId: "session-tenant", actorUserId: "session-user" };
  const state = { signedIn: true, enabled: true, quota: true, calls: [] as { input: Record<string, unknown>; ctx: unknown }[], error: null as Error | null };
  const dependencies: Record<string, unknown> = {
    "@bloqer/ai": { AiProviderError: ProviderError, PURCHASE_REQUEST_AUDIO_MAX_BYTES: 3 * 1024 * 1024, userFacingAiProviderErrorMessage: () => "Error seguro" },
    "@bloqer/services": {
      ServiceError, purchaseRequestAudioAvailable: () => state.enabled,
      transcribePurchaseRequestAudio: async (input: Record<string, unknown>, scope: unknown) => { state.calls.push({ input, ctx: scope }); if (state.error) throw state.error; return "Pedido"; },
      previewPurchaseRequestTranscript: async (input: Record<string, unknown>, scope: unknown) => { state.calls.push({ input, ctx: scope }); if (state.error) throw state.error; return { lines: [] }; },
    },
    "@/lib/tenant-service-context": { buildTenantServiceContext: async () => state.signedIn ? ctx : null },
    "@/lib/ai-rate-limit": { AI_RATE_LIMIT_USER_MESSAGE: "Límite", checkAiChatRateLimit: (input: { tenantId: string; userId: string }) => {
      assert.equal(input.tenantId, ctx.tenantId); assert.equal(input.userId, ctx.actorUserId);
      return state.quota ? { ok: true } : { ok: false, retryAfterSec: 10 };
    } },
  };
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL("../../../app/api/ai/purchase-request-audio/route.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, Response, Request, File, FormData, Buffer, Uint8Array, URL, require: (name: string) => { assert.ok(name in dependencies); return dependencies[name]; } });
  return { state, ctx, ...exports as { GET: () => Promise<Response>; POST: (req: Request) => Promise<Response> } };
}
function json(body = '{"projectId":"project","transcript":"Pedido"}', headers: Record<string, string> = {}) { return new Request(endpoint, { method: "POST", body, headers: { "Content-Type": "application/json", ...headers } }); }
function audio(extra?: string) {
  const form = new FormData(); form.set("projectId", "project"); form.set("file", new File(["RIFFxxxxWAVEfixture"], "pedido.wav", { type: "audio/wav" }));
  if (extra) form.append(extra, "untrusted");
  return new Request(endpoint, { method: "POST", body: form });
}

test("audio HTTP gate requires session, same origin, feature and session quota", async () => {
  const route = fixture(); route.state.signedIn = false;
  assert.equal((await route.GET()).status, 401); assert.equal((await route.POST(json())).status, 401);
  route.state.signedIn = true;
  assert.equal((await route.POST(json(undefined, { Origin: "https://other.test" }))).status, 403);
  assert.equal((await route.POST(json(undefined, { "Sec-Fetch-Site": "cross-site" }))).status, 403);
  route.state.enabled = false;
  assert.deepEqual(await (await route.GET()).json(), { enabled: false });
  assert.equal((await route.POST(json())).status, 503);
  route.state.enabled = true; route.state.quota = false;
  const response = await route.POST(json()); assert.equal(response.status, 429); assert.equal(response.headers.get("retry-after"), "10");
  assert.equal(route.state.calls.length, 0);
});
test("audio HTTP rejects malformed, oversized and scope-injecting bodies before services", async () => {
  const route = fixture();
  for (const req of [json("{"), json("null"), json("[]"), json('{"projectId":"p","transcript":"text","tenantId":"injected"}'), json("x".repeat(40001)), audio("tenantId"), audio("projectId"), audio("file"), new Request(endpoint, { method: "POST", body: "bad", headers: { "Content-Type": "multipart/form-data; boundary=bad" } })]) assert.equal((await route.POST(req)).status, 400);
  for (const withLength of [true, false]) {
    const body = "x".repeat(3 * 1024 * 1024 + 64 * 1024 + 1);
    const req = new Request(endpoint, { method: "POST", body, headers: { "Content-Type": "multipart/form-data; boundary=bad", ...(withLength ? { "Content-Length": String(body.length) } : {}) } });
    assert.equal((await route.POST(req)).status, 400);
  }
  assert.equal(route.state.calls.length, 0);
});
test("audio HTTP forwards only project and evidence using session scope, returns no-store", async () => {
  const route = fixture();
  const transcript = await route.POST(audio()); assert.equal(transcript.status, 200); assert.deepEqual(await transcript.json(), { transcript: "Pedido" });
  assert.equal(route.state.calls[0]?.ctx, route.ctx); assert.deepEqual(Object.keys(route.state.calls[0]!.input).sort(), ["bytes", "mimeType", "projectId", "signal"]);
  const proposal = await route.POST(json()); assert.equal(proposal.status, 200); assert.equal(proposal.headers.get("cache-control"), "no-store");
  assert.deepEqual(Object.keys(route.state.calls[1]!.input).sort(), ["projectId", "signal", "transcript"]); assert.equal(route.state.calls[1]?.ctx, route.ctx);
});
test("audio HTTP preserves ACL errors and hides private provider/internal output", async () => {
  const route = fixture();
  for (const [code, status] of [["FORBIDDEN", 403], ["NOT_FOUND", 404], ["VALIDATION", 400]] as const) { route.state.error = new ServiceError(code, "Seguro"); assert.equal((await route.POST(json())).status, status); }
  for (const [error, status] of [[new ProviderError("BAD_REQUEST", "PRIVATE_DATA"), 502], [new Error("PRIVATE_DATA"), 500]] as const) {
    route.state.error = error; const response = await route.POST(json()); assert.equal(response.status, status); assert.doesNotMatch(await response.text(), /PRIVATE_DATA/);
  }
});
