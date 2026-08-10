import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDecimal, divideDecimal, multiplyDecimal, roundMoney } from "./money";
import { calcLineAmountsFromGrossInclusive } from "./tax-inclusive";

describe("calcLineAmountsFromGrossInclusive", () => {
  it("21% single unit: 121 → net 100 + tax 21", () => {
    const r = calcLineAmountsFromGrossInclusive({
      quantity: "1",
      unitPriceGross: "121",
      taxRatePercent: "21",
    });
    assert.equal(r.lineTotal, "121.00");
    assert.equal(r.lineSubtotal, "100.00");
    assert.equal(r.lineTax, "21.00");
    assert.equal(r.unitPriceNet, "100.0000");
  });

  it("10.5% keeps total = qty × gross", () => {
    const r = calcLineAmountsFromGrossInclusive({
      quantity: "2",
      unitPriceGross: "110.50",
      taxRatePercent: "10.5",
    });
    assert.equal(r.lineTotal, "221.00");
    assert.equal(
      Number(r.lineSubtotal) + Number(r.lineTax),
      Number(r.lineTotal),
    );
  });

  it("0% keeps gross as net", () => {
    const r = calcLineAmountsFromGrossInclusive({
      quantity: "3",
      unitPriceGross: "10",
      taxRatePercent: "0",
    });
    assert.equal(r.lineTotal, "30.00");
    assert.equal(r.lineTax, "0.00");
    assert.equal(r.lineSubtotal, "30.00");
  });

  it("qty≠1 persists 4 dp unit that exclusive-rebuilds line money", () => {
    const r = calcLineAmountsFromGrossInclusive({
      quantity: "3",
      unitPriceGross: "10",
      taxRatePercent: "21",
    });
    assert.equal(r.lineTotal, "30.00");
    assert.equal(r.lineSubtotal, "24.79");
    assert.equal(r.lineTax, "5.21");

    const exclusiveSubtotal = roundMoney(multiplyDecimal("3", r.unitPriceNet));
    assert.equal(exclusiveSubtotal, r.lineSubtotal);
    const exclusiveTax = roundMoney(
      divideDecimal(multiplyDecimal(exclusiveSubtotal, "21"), "100"),
    );
    assert.equal(exclusiveTax, r.lineTax);
    assert.equal(roundMoney(addDecimal(exclusiveSubtotal, exclusiveTax)), r.lineTotal);
  });
});
