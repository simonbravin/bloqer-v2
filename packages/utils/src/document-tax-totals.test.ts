import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calcDocumentHeaderTaxTotals,
  calcIibbPerceptionAmount,
  DEFAULT_IIBB_PERCEPTION_RATE_PCT,
} from "./document-tax-totals";

describe("calcIibbPerceptionAmount", () => {
  it("matches Valerio Oliva reference: 3% on net subtotal", () => {
    assert.equal(calcIibbPerceptionAmount({ subtotal: "1043586.95", ratePercent: "3" }), "31307.61");
  });

  it("returns 0 when rate is 0", () => {
    assert.equal(calcIibbPerceptionAmount({ subtotal: "1000", ratePercent: "0" }), "0.00");
  });
});

describe("calcDocumentHeaderTaxTotals", () => {
  it("builds total = subtotal + IVA + IIBB (reference invoice)", () => {
    const t = calcDocumentHeaderTaxTotals({
      subtotal: "1043586.95",
      taxAmount: "219153.26",
      iibbPerceptionRatePercent: DEFAULT_IIBB_PERCEPTION_RATE_PCT,
    });
    assert.equal(t.iibbPerceptionAmount, "31307.61");
    assert.equal(t.totalAmount, "1294047.82");
  });

  it("honors amount override for centavo match", () => {
    const t = calcDocumentHeaderTaxTotals({
      subtotal: "1000",
      taxAmount: "210",
      iibbPerceptionRatePercent: "3",
      iibbPerceptionAmountOverride: "30.01",
    });
    assert.equal(t.iibbPerceptionAmount, "30.01");
    assert.equal(t.totalAmount, "1240.01");
  });
});
