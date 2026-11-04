import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeApuLineForPersistence } from "./cost-analysis.service";
import { ServiceError } from "../types";

describe("APU Decimal persistence (D-047 / D-053)", () => {
  it("retains resource quantity and price while deriving the unit contribution once", () => {
    const result = normalizeApuLineForPersistence({ coefficient: "99", unitCost: "6000", totalCost: "999", partidaQuantity: "500" }, "390");
    assert.equal(result.coefficient.toString(), "1.2821");
    assert.equal(result.unitCost.toString(), "6000");
    assert.equal(result.totalCost.toString(), "7692.31");
    assert.equal(result.partidaQuantity!.toString(), "500");
  });

  it("uses exact input arithmetic beyond safe IEEE decimal money and rounds half-up", () => {
    const result = normalizeApuLineForPersistence({ coefficient: "1000", unitCost: "99999999999.9999" }, "1");
    assert.equal(result.totalCost.toFixed(2), "99999999999999.90");
    assert.equal(normalizeApuLineForPersistence({ coefficient: "1", unitCost: "1.005" }, 1).totalCost.toFixed(2), "1.01");
  });

  it("rejects persisted or derived decimal overflow before reaching SQL", () => {
    for (const input of [{ coefficient: "100000000000000", unitCost: 1 }, { coefficient: "10000000", unitCost: "10000000" }]) {
      assert.throws(() => normalizeApuLineForPersistence(input, 1), (error: unknown) => error instanceof ServiceError && error.code === "VALIDATION");
    }
  });

  it("normalizes rounded resource inputs before computing their persisted contribution", () => {
    const result = normalizeApuLineForPersistence({ coefficient: 1, unitCost: "2.00005", partidaQuantity: "1.00005" }, "3");
    assert.equal(result.unitCost.toString(), "2.0001");
    assert.equal(result.partidaQuantity!.toString(), "1.0001");
    assert.equal(result.totalCost.toFixed(2), "0.67");
  });

  it("uses the shared exact contribution without intermediate four-decimal quotient rounding", () => {
    const result = normalizeApuLineForPersistence({ coefficient: "0.1908", unitCost: "0.55", partidaQuantity: "1" }, "5.24");
    assert.equal(result.totalCost.toFixed(2), "0.10");
  });

  it("migrates legacy lump unit contribution into Global resource without reusing a rounded coefficient", () => {
    const result = normalizeApuLineForPersistence({ coefficient: "1", unitCost: "1388.8889", totalCost: "1388.8889", partidaQuantity: null, isLumpSum: true }, "900");
    assert.equal(result.unitCost.toString(), "1250000.01");
    assert.equal(result.partidaQuantity!.toString(), "1");
    assert.equal(result.totalCost.toFixed(2), "1388.89");
    assert.equal(result.isLumpSum, false);
  });

  for (const value of ["0", "0.00001"]) it(`rejects total-partida mode for nonpositive persisted quantity ${value}`, () => {
    assert.throws(() => normalizeApuLineForPersistence({ coefficient: 1, unitCost: 10, partidaQuantity: 1 }, value), (error: unknown) => error instanceof ServiceError && error.code === "VALIDATION");
  });

  for (const value of [Infinity, -1, NaN]) it(`rejects nonfinite or negative APU input ${value}`, () => {
    assert.throws(() => normalizeApuLineForPersistence({ coefficient: 1, unitCost: value }, 1), (error: unknown) => error instanceof ServiceError && error.code === "VALIDATION");
  });
});
