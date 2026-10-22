import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calcExclusiveLineAmounts,
  effectiveUnitPriceNet,
  normalizeDiscountPct,
  resolveDocumentLineAmounts,
} from "./line-amounts";

describe("calcExclusiveLineAmounts [D-053]/[D-093]", () => {
  it("0% matches qty × price + IVA", () => {
    const r = calcExclusiveLineAmounts({
      quantity: "1",
      unitPriceNet: "100",
      taxRatePercent: "21",
    });
    assert.equal(r.discountAmount, "0.00");
    assert.equal(r.lineSubtotal, "100.00");
    assert.equal(r.lineTax, "21.00");
    assert.equal(r.lineTotal, "121.00");
  });

  it("10% off before IVA", () => {
    const r = calcExclusiveLineAmounts({
      quantity: "1",
      unitPriceNet: "100",
      taxRatePercent: "21",
      discountPct: "10",
    });
    assert.equal(r.discountAmount, "10.00");
    assert.equal(r.lineSubtotal, "90.00");
    assert.equal(r.lineTax, "18.90");
    assert.equal(r.lineTotal, "108.90");
  });

  it("discounts the rounded subtotal, not qty×price×(1−%)", () => {
    const r = calcExclusiveLineAmounts({
      quantity: "3",
      unitPriceNet: "10.005",
      taxRatePercent: "21",
      discountPct: "10",
    });
    // 3 × 10.005 = 30.015 → 30.02; 10% of 30.02 = 3.00; net 27.02
    assert.equal(r.discountAmount, "3.00");
    assert.equal(r.lineSubtotal, "27.02");
  });

  it("100% zeros the line", () => {
    const r = calcExclusiveLineAmounts({
      quantity: "2",
      unitPriceNet: "50",
      taxRatePercent: "21",
      discountPct: "100",
    });
    assert.equal(r.discountAmount, "100.00");
    assert.equal(r.lineSubtotal, "0.00");
    assert.equal(r.lineTax, "0.00");
    assert.equal(r.lineTotal, "0.00");
  });

  it("rejects pct outside 0–100", () => {
    assert.throws(
      () =>
        calcExclusiveLineAmounts({
          quantity: "1",
          unitPriceNet: "100",
          taxRatePercent: "21",
          discountPct: "101",
        }),
      /DISCOUNT_PCT_OUT_OF_RANGE/,
    );
    assert.throws(() => normalizeDiscountPct("-0.0001"), /DISCOUNT_PCT_OUT_OF_RANGE/);
    assert.equal(normalizeDiscountPct(""), "0.0000");
    assert.equal(normalizeDiscountPct(null), "0.0000");
  });
});

describe("resolveDocumentLineAmounts Factura B + discount", () => {
  it("extracts list net then discounts (not gross × (1−%))", () => {
    const r = resolveDocumentLineAmounts({
      quantity: "1",
      unitPrice: "121",
      taxRatePercent: "21",
      discountPct: "10",
      pricesIncludeTax: true,
    });
    assert.equal(r.unitPriceNet, "100.0000");
    assert.equal(r.lineSubtotal, "90.00");
    assert.equal(r.lineTax, "18.90");
    assert.equal(r.lineTotal, "108.90");
  });

  it("re-save exclusive from persisted list net keeps discounted totals", () => {
    const created = resolveDocumentLineAmounts({
      quantity: "3",
      unitPrice: "10",
      taxRatePercent: "21",
      discountPct: "10",
      pricesIncludeTax: true,
    });
    const reSaved = resolveDocumentLineAmounts({
      quantity: "3",
      unitPrice: created.unitPriceNet,
      taxRatePercent: "21",
      discountPct: "10",
      pricesIncludeTax: false,
    });
    assert.equal(reSaved.unitPriceNet, created.unitPriceNet);
    assert.equal(reSaved.lineSubtotal, created.lineSubtotal);
    assert.equal(reSaved.lineTax, created.lineTax);
    assert.equal(reSaved.lineTotal, created.lineTotal);
  });
});

describe("effectiveUnitPriceNet", () => {
  it("is lineSubtotal / qty at 4 dp", () => {
    assert.equal(
      effectiveUnitPriceNet({ quantity: "1", unitPriceNet: "100", discountPct: "10" }),
      "90.0000",
    );
  });
});

describe("gross totals and unchanged edits [D-086]/[D-117]", () => {
  for (const [quantity, total] of [
    ["1", "10.00"],
    ["333", "3330.00"],
    ["1000", "10000.00"],
  ] as const) {
    it(`keeps gross total ${total} for quantity ${quantity}, including on an unchanged save`, () => {
      const created = resolveDocumentLineAmounts({
        quantity,
        unitPrice: "10",
        taxRatePercent: "21",
        pricesIncludeTax: true,
      });
      assert.equal(created.lineTotal, total);
      const previous = {
        quantity,
        unitPrice: created.unitPriceNet,
        taxRate: "21",
        discountPct: "0",
        ...created,
      };
      const saved = resolveDocumentLineAmounts({
        quantity,
        unitPrice: created.unitPriceNet,
        taxRatePercent: "21.0000",
        previous,
      });
      assert.equal(saved.lineSubtotal, created.lineSubtotal);
      assert.equal(saved.lineTax, created.lineTax);
      assert.equal(saved.lineTotal, total);
    });
  }

  it("recalculates for each monetary input change and for explicit gross interpretation", () => {
    const original = resolveDocumentLineAmounts({
      quantity: "1",
      unitPrice: "10",
      taxRatePercent: "21",
      pricesIncludeTax: true,
    });
    const previous = {
      quantity: "1",
      unitPrice: original.unitPriceNet,
      taxRate: "21",
      discountPct: "0",
      ...original,
    };
    const input = { quantity: "1", unitPrice: original.unitPriceNet, taxRatePercent: "21" };
    for (const patch of [
      { quantity: "2" },
      { unitPrice: "8.27" },
      { taxRatePercent: "0" },
      { discountPct: "10" },
      { pricesIncludeTax: true },
    ]) {
      const changed = { ...input, ...patch };
      assert.deepEqual(
        resolveDocumentLineAmounts({ ...changed, previous }),
        resolveDocumentLineAmounts(changed),
      );
    }
  });
});
