import assert from "node:assert/strict";
import { test } from "node:test";
import { createFakeAiProvider, type ProcurementQuoteDocumentExtraction } from "@bloqer/ai";
import { ServiceError, type ServiceContext } from "../types";
import { buildProcurementQuoteDocumentPreview, previewProcurementQuoteDocument } from "./procurement-quote-document.service";

const fields: ProcurementQuoteDocumentExtraction = { documentKind: "QUOTE", supplierName: "Fixture", currency: "ARS", validUntil: "2026-12-30", leadTimeDays: 7, pricesIncludeTax: false, iibbPerceptionRate: "0", total: "242.00", hasUnsupportedCharges: false,
  lines: [{ description: "Material", quantity: "2", unit: "un", offerKind: "QUOTED", unitPrice: "100", taxRate: "21", discountPct: "0" }] };
const ctx: ServiceContext = { tenantId: "tenant", companyId: "company", actorUserId: "user", roles: ["OWNER"] };
const projectId = "00000000-0000-4000-8000-000000000001", purchaseRequestId = "00000000-0000-4000-8000-000000000002";
const input = { projectId, purchaseRequestId, mimeType: "application/pdf", bytes: new Uint8Array(Buffer.from("%PDF-1.7 fixture")) };
function fixture() {
  let calls = 0;
  const provider = createFakeAiProvider(); provider.capabilities.supportsVision = true; provider.capabilities.supportsStructuredOutput = true;
  provider.generateResponse = async request => { calls++; assert.equal(request.tools, undefined); return { message: { role: "assistant", content: JSON.stringify(fields) }, finishReason: "stop", usage: {} }; };
  type Deps = NonNullable<Parameters<typeof previewProcurementQuoteDocument>[2]>;
  const request = { projectId, status: "SUBMITTED" } as Awaited<ReturnType<Deps["request"]>>;
  const deps: Deps = { enabled: () => true, module: async () => {}, request: async (id, scope) => { assert.equal(id, purchaseRequestId); assert.equal(scope, ctx); return request; },
    project: async () => ({ id: projectId, tenantId: ctx.tenantId, companyId: ctx.companyId, status: "ACTIVE", country: "AR" }),
    sniff: async () => {}, provider: () => provider, config: () => ({ enabled: true, providerId: "fake", model: "test", timeoutMs: 5000, maxToolCalls: 0, maxAgentTurns: 1, maxOutputTokens: 8000 }) };
  return { deps, request, calls: () => calls };
}
test("quote evidence uses existing money kernel, blocks inconsistent totals/charges and preserves unknowns", () => {
  assert.deepEqual(buildProcurementQuoteDocumentPreview(fields).blockingReasons, []);
  assert.ok(buildProcurementQuoteDocumentPreview({ ...fields, total: "243" }).blockingReasons.length);
  assert.ok(buildProcurementQuoteDocumentPreview({ ...fields, hasUnsupportedCharges: true }).blockingReasons.length);
  const unknown = buildProcurementQuoteDocumentPreview({ ...fields, pricesIncludeTax: null, iibbPerceptionRate: null });
  assert.equal(unknown.pricesIncludeTax, null); assert.equal(unknown.iibbPerceptionRate, null); assert.ok(unknown.warnings.some(w => w.includes("Faltan datos")));
  assert.ok(buildProcurementQuoteDocumentPreview({ ...fields, lines: [{ ...fields.lines[0]!, offerKind: "BONIFIED" }] }).blockingReasons.length);
  assert.ok(buildProcurementQuoteDocumentPreview({ ...fields, lines: [{ ...fields.lines[0]!, offerKind: "NOT_QUOTED", discountPct: "100" }] }).blockingReasons.length);
});
test("quote preview validates session, role, project/request scope and state before AI", async () => {
  const f = fixture();
  await assert.rejects(previewProcurementQuoteDocument(input, ctx, { ...f.deps, enabled: () => false }));
  await assert.rejects(previewProcurementQuoteDocument(input, { ...ctx, actorUserId: "" }, f.deps));
  await assert.rejects(previewProcurementQuoteDocument(input, { ...ctx, roles: ["SITE_FOREMAN"] }, f.deps));
  for (const boundary of ["module", "request", "project"] as const) await assert.rejects(previewProcurementQuoteDocument(input, ctx, { ...f.deps, [boundary]: async () => { throw new ServiceError("FORBIDDEN", "Denied"); } }));
  await assert.rejects(previewProcurementQuoteDocument({ ...input, projectId: purchaseRequestId }, ctx, f.deps));
  f.request.status = "DRAFT";
  await assert.rejects(previewProcurementQuoteDocument(input, ctx, f.deps)); assert.equal(f.calls(), 0);
  f.request.status = "SUBMITTED";
  assert.equal((await previewProcurementQuoteDocument(input, ctx, f.deps)).total, "242.00"); assert.equal(f.calls(), 1);
});
test("quote preview refuses MIME, size, byte mismatch and cancellation before provider calls", async () => {
  const f = fixture();
  for (const overrides of [{ mimeType: "text/html" }, { bytes: new Uint8Array() }, { bytes: new Uint8Array(3 * 1024 * 1024 + 1) }, { signal: AbortSignal.abort() }]) await assert.rejects(previewProcurementQuoteDocument({ ...input, ...overrides }, ctx, f.deps));
  await assert.rejects(previewProcurementQuoteDocument(input, ctx, { ...f.deps, sniff: async () => { throw new ServiceError("VALIDATION", "Mismatch"); } })); assert.equal(f.calls(), 0);
});
