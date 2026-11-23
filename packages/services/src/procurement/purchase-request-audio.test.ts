import assert from "node:assert/strict";
import { test } from "node:test";
import { createFakeAiProvider, type AiProvider } from "@bloqer/ai";
import { ServiceError, type ServiceContext } from "../types";
import { transcribePurchaseRequestAudio, previewPurchaseRequestTranscript, validatePurchaseRequestAudio } from "./purchase-request-audio.service";

const projectId = "00000000-0000-4000-8000-000000000001";
const ctx: ServiceContext = { tenantId: "tenant", actorUserId: "user", companyId: "company", roles: ["OWNER"] };
const wav = new Uint8Array(Buffer.from("RIFF0000WAVEsynthetic"));
function fixture() {
  let calls = 0;
  const provider: AiProvider = createFakeAiProvider();
  provider.capabilities.supportsStructuredOutput = true;
  provider.transcribeAudio = async (request) => { calls++; assert.equal(request.mimeType, "audio/wav"); return "Dos bolsas de cemento"; };
  provider.generateResponse = async (request) => {
    calls++; assert.equal(request.tools, undefined);
    return { message: { role: "assistant", content: JSON.stringify({ neededByDate: null, observations: null, lines: [{ description: "Cemento", quantity: "2", unit: "bolsa" }] }) }, finishReason: "stop", usage: {} };
  };
  const deps: NonNullable<Parameters<typeof transcribePurchaseRequestAudio>[2]> = {
    enabled: () => true,
    assertModule: async (scope) => { assert.equal(scope, ctx); },
    assertProject: async (id, scope) => { assert.equal(id, projectId); assert.equal(scope.tenantId, ctx.tenantId); return { id, tenantId: ctx.tenantId, companyId: "company", status: "ACTIVE", country: "AR" }; },
    provider: () => provider, transcriptionModel: () => "test-transcription",
    config: () => ({ enabled: true, providerId: "fake", model: "test", timeoutMs: 5000, maxToolCalls: 0, maxAgentTurns: 0, maxOutputTokens: 4000 }),
  };
  return { deps, calls: () => calls };
}
test("audio validates size and signatures before provider access", () => {
  assert.equal(validatePurchaseRequestAudio(wav, "audio/wav"), "audio/wav");
  assert.equal(validatePurchaseRequestAudio(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0]), "audio/webm;codecs=opus"), "audio/webm");
  assert.equal(validatePurchaseRequestAudio(new Uint8Array(Buffer.from("0000ftypM4A ")), "audio/mp4"), "audio/mp4");
  for (const [bytes, mime] of [[wav, "audio/webm"], [wav, "text/html"], [new Uint8Array(), "audio/wav"], [new Uint8Array(3 * 1024 * 1024 + 1), "audio/wav"]] as const) assert.throws(() => validatePurchaseRequestAudio(bytes, mime));
});
test("transcription and proposal are ephemeral and use authenticated scope", async () => {
  const f = fixture();
  assert.equal(await transcribePurchaseRequestAudio({ projectId, bytes: wav, mimeType: "audio/wav" }, ctx, f.deps), "Dos bolsas de cemento");
  const result = await previewPurchaseRequestTranscript({ projectId, transcript: "Dos bolsas de cemento" }, ctx, f.deps);
  assert.equal(result.lines[0]?.quantity, "2"); assert.equal(f.calls(), 2);
});
test("disabled feature, unauthorized role, inactive or inaccessible project and cross-company scope never reach AI", async () => {
  const f = fixture();
  const input = { projectId, bytes: wav, mimeType: "audio/wav" };
  await assert.rejects(transcribePurchaseRequestAudio(input, ctx, { ...f.deps, enabled: () => false }), { code: "FORBIDDEN" });
  await assert.rejects(transcribePurchaseRequestAudio(input, { ...ctx, actorUserId: "" }, f.deps), { code: "UNAUTHORIZED" });
  await assert.rejects(transcribePurchaseRequestAudio(input, { ...ctx, roles: ["VIEWER"] }, { ...f.deps, assertModule: async () => {} }), { code: "FORBIDDEN" });
  for (const code of ["FORBIDDEN", "CONFLICT", "NOT_FOUND"] as const) await assert.rejects(transcribePurchaseRequestAudio(input, ctx, { ...f.deps, assertProject: async () => { throw new ServiceError(code, "blocked"); } }), { code });
  await assert.rejects(transcribePurchaseRequestAudio(input, ctx, { ...f.deps, assertProject: async () => ({ id: projectId, tenantId: ctx.tenantId, companyId: "other", status: "ACTIVE", country: "AR" }) }), { code: "FORBIDDEN" });
  assert.equal(f.calls(), 0);
});
test("bad bytes, empty or oversized transcripts and cancellation stop before provider calls", async () => {
  const f = fixture();
  await assert.rejects(transcribePurchaseRequestAudio({ projectId, bytes: new Uint8Array([1]), mimeType: "audio/wav" }, ctx, f.deps));
  for (const transcript of [" ", "x".repeat(8001)]) await assert.rejects(previewPurchaseRequestTranscript({ projectId, transcript }, ctx, f.deps));
  await assert.rejects(transcribePurchaseRequestAudio({ projectId, bytes: wav, mimeType: "audio/wav", signal: AbortSignal.abort() }, ctx, f.deps));
  assert.equal(f.calls(), 0);
});
