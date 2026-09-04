import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createPurchaseOrderFromQuoteLinesSchema,
  createPurchaseOrdersFromAwardsSchema,
} from "@bloqer/validators";

describe("createPurchaseOrderFromQuoteLinesSchema", () => {
  it("requires at least one line id", () => {
    const r = createPurchaseOrderFromQuoteLinesSchema.safeParse({
      procurementQuoteId: "11111111-1111-4111-8111-111111111111",
      purchaseRequestLineIds: [],
    });
    assert.equal(r.success, false);
  });

  it("rejects duplicate line ids", () => {
    const id = "22222222-2222-4222-8222-222222222222";
    const r = createPurchaseOrderFromQuoteLinesSchema.safeParse({
      procurementQuoteId: "11111111-1111-4111-8111-111111111111",
      purchaseRequestLineIds: [id, id],
    });
    assert.equal(r.success, false);
  });

  it("accepts unique line ids", () => {
    const r = createPurchaseOrderFromQuoteLinesSchema.safeParse({
      procurementQuoteId: "11111111-1111-4111-8111-111111111111",
      purchaseRequestLineIds: [
        "22222222-2222-4222-8222-222222222222",
        "33333333-3333-4333-8333-333333333333",
      ],
    });
    assert.equal(r.success, true);
  });
});

describe("createPurchaseOrdersFromAwardsSchema", () => {
  it("accepts multi-group award payload", () => {
    const r = createPurchaseOrdersFromAwardsSchema.safeParse({
      purchaseRequestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      groups: [
        {
          procurementQuoteId: "11111111-1111-4111-8111-111111111111",
          purchaseRequestLineIds: ["22222222-2222-4222-8222-222222222222"],
        },
        {
          procurementQuoteId: "33333333-3333-4333-8333-333333333333",
          purchaseRequestLineIds: [
            "44444444-4444-4444-8444-444444444444",
            "55555555-5555-4555-8555-555555555555",
          ],
        },
      ],
    });
    assert.equal(r.success, true);
  });

  it("rejects the same line id across groups", () => {
    const shared = "22222222-2222-4222-8222-222222222222";
    const r = createPurchaseOrdersFromAwardsSchema.safeParse({
      purchaseRequestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      groups: [
        {
          procurementQuoteId: "11111111-1111-4111-8111-111111111111",
          purchaseRequestLineIds: [shared],
        },
        {
          procurementQuoteId: "33333333-3333-4333-8333-333333333333",
          purchaseRequestLineIds: [shared],
        },
      ],
    });
    assert.equal(r.success, false);
  });
});
