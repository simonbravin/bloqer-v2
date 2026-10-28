import assert from "node:assert/strict";
import test from "node:test";
import { certificationWeightedPhysicalPct } from "./certification-physical-pct";

test("certificate physical percentages retain their 0–100 scale", () => {
  assert.equal(certificationWeightedPhysicalPct("25000", "500"), "50.00");
  assert.equal(certificationWeightedPhysicalPct("100000", "1000"), "100.00");
});

test("weighted physical percentage handles empty base and half-up rounding", () => {
  assert.equal(certificationWeightedPhysicalPct("0", "0"), "0.00");
  assert.equal(certificationWeightedPhysicalPct("100", "3"), "33.33");
  assert.equal(certificationWeightedPhysicalPct("20001", "200"), "100.01");
});
