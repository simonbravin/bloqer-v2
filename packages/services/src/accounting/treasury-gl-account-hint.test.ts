import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { suggestTreasuryGlAccountCode } from "./treasury-gl-account-hint";

describe("suggestTreasuryGlAccountCode", () => {
  it("maps CASH to Caja", () => {
    assert.equal(suggestTreasuryGlAccountCode({ type: "CASH", currency: "ARS" }), "1.1.01");
    assert.equal(suggestTreasuryGlAccountCode({ type: "CASH", currency: "USD" }), "1.1.01");
  });

  it("maps BANK by currency", () => {
    assert.equal(suggestTreasuryGlAccountCode({ type: "BANK", currency: "ARS" }), "1.1.02");
    assert.equal(suggestTreasuryGlAccountCode({ type: "BANK", currency: "usd" }), "1.1.03");
  });

  it("defaults wallet/other to Bancos ARS", () => {
    assert.equal(suggestTreasuryGlAccountCode({ type: "DIGITAL_WALLET", currency: "ARS" }), "1.1.02");
    assert.equal(suggestTreasuryGlAccountCode({ type: "OTHER", currency: "USD" }), "1.1.02");
  });
});
