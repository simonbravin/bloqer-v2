import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { discountPctString } from "@bloqer/validators";

describe("discountPctString [D-093]", () => {
  it("accepts es-AR commas and empty → 0", () => {
    assert.equal(discountPctString.parse("10,5"), "10.5000");
    assert.equal(discountPctString.parse(""), "0.0000");
    assert.equal(discountPctString.parse("100"), "100.0000");
  });

  it("rejects outside 0–100", () => {
    assert.throws(() => discountPctString.parse("101"));
    assert.throws(() => discountPctString.parse("-0.01"));
  });
});
