import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { discountPctString, unitPriceString } from "./money";

describe("unitPriceString", () => {
  it("preserves canonical three-decimal fractions through repeated service validation", () => {
    for (const [input, expected] of [["0.025", "0.0250"], ["1.234", "1.2340"], ["1234.567", "1234.5670"]]) {
      assert.equal(unitPriceString.parse(input), expected);
      assert.equal(unitPriceString.parse(unitPriceString.parse(input)), expected);
    }
  });
  it("preserves canonical fractional discounts while keeping localized comma input", () => {
    assert.equal(discountPctString.parse("1.234"), "1.2340");
    assert.equal(discountPctString.parse("1,234"), "1.2340");
    assert.equal(discountPctString.parse(discountPctString.parse("1.234")), "1.2340");
  });
  it("accepts empty as zero (cleared DecimalInput)", () => {
    const r = unitPriceString.safeParse("");
    assert.equal(r.success, true);
    if (r.success) assert.equal(r.data, "0.0000");
  });

  it("accepts whitespace-only as zero", () => {
    const r = unitPriceString.safeParse("  ");
    assert.equal(r.success, true);
    if (r.success) assert.equal(r.data, "0.0000");
  });

  it("accepts es-AR grouped decimals", () => {
    const r = unitPriceString.safeParse("1.234,56");
    assert.equal(r.success, true);
    if (r.success) assert.equal(r.data, "1234.5600");
  });

  it("still rejects non-decimal junk", () => {
    const r = unitPriceString.safeParse("abc");
    assert.equal(r.success, false);
    if (!r.success) {
      assert.equal(r.error.issues[0]?.message, "Precio inválido");
    }
  });
});
