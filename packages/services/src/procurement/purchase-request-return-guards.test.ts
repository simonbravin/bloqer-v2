import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ServiceError } from "../types";
import {
  assertPurchaseRequestReturnable,
  isBlockingProcurementQuoteStatus,
} from "./purchase-request-return-guards";

function expectConflict(fn: () => void, messageIncludes: string) {
  assert.throws(fn, (err: unknown) => {
    assert.ok(err instanceof ServiceError);
    assert.equal(err.code, "CONFLICT");
    assert.ok(err.message.includes(messageIncludes));
    return true;
  });
}

describe("isBlockingProcurementQuoteStatus", () => {
  it("treats active quote statuses as blocking", () => {
    assert.equal(isBlockingProcurementQuoteStatus("DRAFT"), true);
    assert.equal(isBlockingProcurementQuoteStatus("RECEIVED"), true);
    assert.equal(isBlockingProcurementQuoteStatus("SELECTED"), true);
  });

  it("ignores rejected or superseded quotes", () => {
    assert.equal(isBlockingProcurementQuoteStatus("REJECTED"), false);
    assert.equal(isBlockingProcurementQuoteStatus("SUPERSEDED"), false);
  });
});

describe("assertPurchaseRequestReturnable [BR-PUR-025]", () => {
  it("allows SUBMITTED with zero quotes, POs, and awards", () => {
    assert.doesNotThrow(() =>
      assertPurchaseRequestReturnable({
        status: "SUBMITTED",
        quoteCount: 0,
        activePoCount: 0,
        awardedLineCount: 0,
      }),
    );
  });

  it("blocks non-SUBMITTED statuses", () => {
    for (const status of ["DRAFT", "QUOTE_SELECTED", "COMPLETED", "CANCELLED"]) {
      expectConflict(
        () =>
          assertPurchaseRequestReturnable({
            status,
            quoteCount: 0,
            activePoCount: 0,
            awardedLineCount: 0,
          }),
        "enviada",
      );
    }
  });

  it("blocks when quotes exist", () => {
    expectConflict(
      () =>
        assertPurchaseRequestReturnable({
          status: "SUBMITTED",
          quoteCount: 1,
          activePoCount: 0,
          awardedLineCount: 0,
        }),
      "cotizaciones",
    );
  });

  it("blocks when active POs exist", () => {
    expectConflict(
      () =>
        assertPurchaseRequestReturnable({
          status: "SUBMITTED",
          quoteCount: 0,
          activePoCount: 1,
          awardedLineCount: 0,
        }),
      "órdenes de compra",
    );
  });

  it("blocks when awarded lines exist", () => {
    expectConflict(
      () =>
        assertPurchaseRequestReturnable({
          status: "SUBMITTED",
          quoteCount: 0,
          activePoCount: 0,
          awardedLineCount: 1,
        }),
      "adjudicados",
    );
  });
});
