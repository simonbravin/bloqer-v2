import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDecimal, multiplyDecimal } from "@bloqer/utils";
import { computeApuUnitContribution } from "./budget-apu-calc";

describe("shared APU unit contribution (D-047 / D-053)", () => {
  it("rounds two total-partida contributions before the item cost is totaled", () => {
    const resource = { coefficient: "0.2", unitCost: "0.52", partidaQuantity: "1" };
    const contribution = computeApuUnitContribution(resource, "5");
    assert.equal(contribution, "0.10");
    assert.equal(multiplyDecimal(addDecimal(contribution, contribution), "5"), "1.00");
  });

  it("does not round a resource quotient twice", () => {
    assert.equal(computeApuUnitContribution({ coefficient: "0.1908", unitCost: "0.55", partidaQuantity: "1" }, "5.24"), "0.10");
  });

  it("derives resource money from physical quantity rather than the rounded coefficient", () => {
    assert.equal(computeApuUnitContribution({ coefficient: "1.2821", unitCost: "6000", partidaQuantity: "500" }, "390"), "7692.31");
  });

  it("uses four-decimal operands and one half-up money boundary", () => {
    assert.equal(computeApuUnitContribution({ coefficient: 1, unitCost: "1.005" }, 0), "1.01");
    assert.equal(computeApuUnitContribution({ coefficient: "1.00005", unitCost: "2.00005" }, 1), "2.00");
    assert.equal(computeApuUnitContribution({ coefficient: 1, unitCost: "2.00005", partidaQuantity: "1.00005" }, "3"), "0.67");
  });

  it("preserves cents at the supported storage boundary without IEEE arithmetic", () => {
    assert.equal(computeApuUnitContribution({ coefficient: "1000", unitCost: "99999999999.9999" }, 1), "99999999999999.90");
  });

  it("allows zero resource amounts but cannot divide a total-partida line by zero", () => {
    assert.equal(computeApuUnitContribution({ coefficient: 0, unitCost: 100, partidaQuantity: 0 }, 5), "0.00");
    assert.throws(() => computeApuUnitContribution({ coefficient: 1, unitCost: 1, partidaQuantity: 1 }, 0), /DIVISION_BY_ZERO/);
  });
});
