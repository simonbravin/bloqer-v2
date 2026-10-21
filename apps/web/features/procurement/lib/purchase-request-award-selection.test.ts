import assert from "node:assert/strict";
import { test } from "node:test";

import { buildPurchaseRequestAwardGroups } from "./purchase-request-award-selection";

const lines = [{ id: "waterproofing" }, { id: "anchor" }];
const quotes = ["supplier-a", "supplier-b"].map((id) => ({
  id,
  status: "RECEIVED",
  lines: lines.map((l) => ({ purchaseRequestLineId: l.id })),
}));

test("partial selection sends only the selected whole line", () => {
  assert.deepEqual(
    buildPurchaseRequestAwardGroups(lines, quotes, { waterproofing: "supplier-a" }),
    [{ procurementQuoteId: "supplier-a", purchaseRequestLineIds: ["waterproofing"] }],
  );
});

test("groups whole lines by supplier without duplicating them", () => {
  assert.deepEqual(
    buildPurchaseRequestAwardGroups(lines, quotes, {
      waterproofing: "supplier-a",
      anchor: "supplier-b",
    }),
    [
      { procurementQuoteId: "supplier-a", purchaseRequestLineIds: ["waterproofing"] },
      { procurementQuoteId: "supplier-b", purchaseRequestLineIds: ["anchor"] },
    ],
  );
  assert.deepEqual(
    buildPurchaseRequestAwardGroups(lines, quotes, {
      waterproofing: "supplier-a",
      anchor: "supplier-a",
    }),
    [{ procurementQuoteId: "supplier-a", purchaseRequestLineIds: ["waterproofing", "anchor"] }],
  );
});

test("leaving one selection pending removes it from the payload", () => {
  assert.deepEqual(
    buildPurchaseRequestAwardGroups(lines, quotes, {
      waterproofing: "",
      anchor: "supplier-b",
    }),
    [{ procurementQuoteId: "supplier-b", purchaseRequestLineIds: ["anchor"] }],
  );
});

test("empty selection cannot invoke a mutation", () => {
  assert.throws(() => buildPurchaseRequestAwardGroups(lines, quotes, {}), /al menos un ítem/);
});

test("a refresh cannot resend an awarded line or an unrelated stale selection", () => {
  assert.deepEqual(
    buildPurchaseRequestAwardGroups(
      [{ id: "waterproofing", awardedPurchaseOrderId: "existing-po" }, lines[1]!],
      quotes,
      { waterproofing: "supplier-a", anchor: "supplier-b", unrelated: "supplier-a" },
    ),
    [{ procurementQuoteId: "supplier-b", purchaseRequestLineIds: ["anchor"] }],
  );
});

test("rejects unavailable quotes and quotes missing a selected line", () => {
  for (const invalidQuotes of [
    [],
    [{ ...quotes[0]!, status: "REJECTED" }],
    [{ ...quotes[0]!, lines: [] }],
  ]) {
    assert.throws(
      () =>
        buildPurchaseRequestAwardGroups(lines, invalidQuotes, {
          waterproofing: "supplier-a",
        }),
      /selección cambió/,
    );
  }
});

test("a selected quote can still cover a free line after another award", () => {
  assert.deepEqual(
    buildPurchaseRequestAwardGroups(lines, [{ ...quotes[0]!, status: "SELECTED" }], {
      anchor: "supplier-a",
    }),
    [{ procurementQuoteId: "supplier-a", purchaseRequestLineIds: ["anchor"] }],
  );
});
