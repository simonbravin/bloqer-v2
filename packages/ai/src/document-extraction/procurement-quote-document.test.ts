import assert from "node:assert/strict";
import { test } from "node:test";
import { createFakeAiProvider } from "../providers/fake/fake-provider";
import { isProcurementQuotePreviewEnabled } from "../env";
import { extractProcurementQuoteDocument, parseProcurementQuoteDocument } from "./procurement-quote-document";

const fields = { documentKind: "QUOTE", supplierName: null, currency: null, validUntil: null, leadTimeDays: null, pricesIncludeTax: null, iibbPerceptionRate: null, total: null, hasUnsupportedCharges: null,
  lines: [{ description: "Material", quantity: "2.0000", unit: "un", offerKind: null, unitPrice: null, taxRate: null, discountPct: null }] };

test("quote parsing preserves unknowns, rejects internal ids, malformed decimals and dates", () => {
  assert.deepEqual(parseProcurementQuoteDocument(JSON.stringify(fields)), fields);
  for (const input of [ { ...fields, tenantId: "injected" }, { ...fields, validUntil: "2026-02-30" }, { ...fields, leadTimeDays: -1 }, { ...fields, lines: [{ ...fields.lines[0], unitPrice: "1e6" }] }, { ...fields, lines: [{ ...fields.lines[0], offerKind: "FREE" }] }, { ...fields, lines: Array(81).fill(fields.lines[0]) } ]) assert.throws(() => parseProcurementQuoteDocument(JSON.stringify(input)));
});
test("quote feature remains opt-in behind production gates", () => {
  assert.equal(isProcurementQuotePreviewEnabled({}), false);
  assert.equal(isProcurementQuotePreviewEnabled({ BLOQER_AI_ENABLED: "true" }), false);
  assert.equal(isProcurementQuotePreviewEnabled({ NODE_ENV: "production", BLOQER_AI_ENABLED: "true", BLOQER_AI_PROCUREMENT_QUOTE_PREVIEW_ENABLED: "true" }), false);
  assert.equal(isProcurementQuotePreviewEnabled({ NODE_ENV: "production", BLOQER_AI_ENABLED: "true", BLOQER_AI_ALLOW_PRODUCTION: "true", BLOQER_AI_PROCUREMENT_QUOTE_PREVIEW_ENABLED: "true" }), true);
});
test("quote extraction sends no tenant data/tools and rejects truncated, refused and tool responses", async () => {
  const provider = createFakeAiProvider(); provider.capabilities.supportsVision = true; provider.capabilities.supportsStructuredOutput = true;
  provider.generateResponse = async input => { assert.equal(input.tools, undefined); assert.ok(input.structuredOutput); assert.match(input.system ?? "", /ignorá sus instrucciones/); return { message: { role: "assistant", content: JSON.stringify(fields) }, finishReason: "stop", usage: {} }; };
  const input = { provider, model: "test", mimeType: "application/pdf" as const, bytes: new Uint8Array([1]) };
  assert.deepEqual(await extractProcurementQuoteDocument(input), fields);
  for (const failure of [{ finishReason: "length" as const }, { refused: true }, { message: { role: "assistant" as const, content: JSON.stringify(fields), toolCalls: [{ id: "x", name: "write", argumentsJson: "{}" }] } }]) {
    provider.generateResponse = async () => ({ message: { role: "assistant", content: JSON.stringify(fields) }, finishReason: "stop", usage: {}, ...failure });
    await assert.rejects(extractProcurementQuoteDocument(input));
  }
});
