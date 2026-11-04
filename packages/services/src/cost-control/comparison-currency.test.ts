import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ServiceError } from "../types";
import { assertBudgetCurrency } from "./comparison-currency";

describe("D-122 budget currency comparison", () => {
  it("preserves the actual budget currency instead of assuming ARS", () => {
    for (const currency of ["ARS", "USD", "EUR"]) {
      assert.doesNotThrow(() => assertBudgetCurrency(currency, currency));
    }
  });

  it("rejects a different source currency without converting or omitting it", () => {
    assert.throws(
      () => assertBudgetCurrency("USD", "ARS"),
      (error) => error instanceof ServiceError && error.code === "VALIDATION" &&
        error.message.includes("USD") && error.message.includes("ARS") &&
        error.message.includes("cantidades siguen disponibles"),
    );
  });

  it("does not treat missing currency as zero cost or FX 1", () => {
    for (const currency of [null, undefined, ""]) {
      assert.throws(
        () => assertBudgetCurrency("ARS", currency),
        (error) => error instanceof ServiceError && error.code === "VALIDATION" &&
          error.message.includes("sin moneda trazable"),
      );
    }
  });
});
