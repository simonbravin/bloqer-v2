import assert from "node:assert/strict";
import { test } from "node:test";
import { ServiceError } from "../types";
import { assertTreasuryAccountCurrencyMatches } from "./treasury-currency-guards";

test("assertTreasuryAccountCurrencyMatches allows same currency", () => {
  assert.doesNotThrow(() => assertTreasuryAccountCurrencyMatches("ARS", "ARS"));
});

test("assertTreasuryAccountCurrencyMatches rejects mismatch", () => {
  assert.throws(
    () => assertTreasuryAccountCurrencyMatches("USD", "ARS"),
    (err) => err instanceof ServiceError && err.code === "CONFLICT",
  );
});
