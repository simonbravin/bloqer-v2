import assert from "node:assert/strict";
import { test } from "node:test";
import type { ProcurementQuoteDocumentPreview } from "@bloqer/ai";
import { mapQuoteDocumentLines } from "./quote-document-mapping";
const source = { description: "Material", quantity: "2", unit: "un", offerKind: "QUOTED" as const, unitPrice: "100", taxRate: null, discountPct: null };
const preview: ProcurementQuoteDocumentPreview = { documentKind: "QUOTE", supplierName: null, currency: null, validUntil: null, leadTimeDays: null, pricesIncludeTax: null, iibbPerceptionRate: null, total: null, hasUnsupportedCharges: null, lines: [source], blockingReasons: [], warnings: [] };
const lines = [{ id: "line", description: "Material", quantity: "2.0000", unit: "un" }];
test("quote mapping requires human choices and preserves unknown taxes/discounts without inferring ids", () => {
  assert.ok(mapQuoteDocumentLines(preview, lines, []).error);
  assert.ok(mapQuoteDocumentLines(preview, lines, ["foreign"]).error);
  assert.ok(mapQuoteDocumentLines(preview, lines, ["exclude"]).error);
  const result = mapQuoteDocumentLines(preview, lines, ["line"]);
  assert.equal(result.value?.lines.line?.taxRate, null); assert.equal(result.value?.lines.line?.discountPct, null);
});
test("quote mapping rejects duplicated targets, quantity differences and unit conversions", () => {
  assert.ok(mapQuoteDocumentLines({ ...preview, lines: [source, source] }, lines, ["line", "line"]).error);
  for (const input of [{ ...source, quantity: "3" }, { ...source, unit: "caja" }, { ...source, quantity: null }, { ...source, unit: null }]) assert.ok(mapQuoteDocumentLines({ ...preview, lines: [input] }, lines, ["line"]).error);
  assert.ok(mapQuoteDocumentLines({ ...preview, lines: [source, source] }, lines, ["line", "exclude"]).value);
  assert.ok(mapQuoteDocumentLines({ ...preview, blockingReasons: ["Cargos extra"] }, lines, ["line"]).error);
});
