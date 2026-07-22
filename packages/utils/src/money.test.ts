import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  divideDecimal,
  multiplyDecimal,
  resolveFxAmounts,
  roundMoney,
  roundToDecimals,
  serializeMoney,
  sumAmountArsStrings,
} from "./index";

describe("roundToDecimals half-up", () => {
  it("rounds 1.005 to 1.01 at 2dp", () => {
    assert.equal(roundToDecimals("1.005", 2), "1.01");
    assert.equal(roundMoney("1.005"), "1.01");
  });

  it("rounds 1.004 to 1.00 at 2dp", () => {
    assert.equal(roundMoney("1.004"), "1.00");
  });

  it("pads serializeMoney", () => {
    assert.equal(serializeMoney("100"), "100.00");
    assert.equal(serializeMoney("100.5"), "100.50");
  });

  it("handles negatives", () => {
    assert.equal(roundMoney("-1.005"), "-1.01");
  });
});

describe("resolveFxAmounts", () => {
  it("ARS uses fx=1 and amount_ars at 2dp", () => {
    const r = resolveFxAmounts({ currency: "ARS", amount: "10.125" });
    assert.equal(r.fxRate, "1.000000");
    assert.equal(r.amountArs, "10.13");
  });

  it("multiplies without float and rounds amount_ars to 2", () => {
    const r = resolveFxAmounts({ currency: "USD", amount: "100", fxRate: "1180.1234567" });
    assert.equal(r.fxRate, "1180.123457");
    assert.equal(r.amountArs, serializeMoney(multiplyDecimal("100", r.fxRate)));
  });

  it("requires FX for non-ARS", () => {
    assert.throws(() => resolveFxAmounts({ currency: "USD", amount: "1" }), /FX_RATE_REQUIRED/);
  });
});

describe("sumAmountArsStrings", () => {
  it("sums and rounds to 2", () => {
    assert.equal(sumAmountArsStrings([{ amountArs: "1.10" }, { amountArs: "2.01" }]), "3.11");
  });
});

describe("divideDecimal half-up single round", () => {
  it("does not double-round 1.2245 / 1 to 2dp", () => {
    assert.equal(divideDecimal("1.2245", "1", 2), "1.22");
  });

  it("matches tax-style division 4.07 * 21 / 100", () => {
    // 85.47 / 100 = 0.8547 → 0.85
    assert.equal(divideDecimal(multiplyDecimal("4.07", "21"), "100", 2), "0.85");
  });
});
