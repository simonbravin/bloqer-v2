import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { moneyMapFromRows, treasuryBalanceMap } from "./finance-corporate-kpis.service";

describe("finance-corporate-kpis helpers", () => {
  it("moneyMapFromRows builds decimal map by currency", () => {
    const m = moneyMapFromRows([
      { currency: "ARS", amount: "100.50" },
      { currency: "USD", amount: "20" },
    ]);
    assert.equal(m.get("ARS")?.toString(), "100.5");
    assert.equal(m.get("USD")?.toString(), "20");
  });

  it("treasuryBalanceMap aggregates accounts by currency", () => {
    const m = treasuryBalanceMap([
      { currency: "ARS", balance: "1000", id: "a1", name: "A", type: "BANK", status: "ACTIVE", companyId: null, companyName: null },
      { currency: "ARS", balance: "500", id: "a2", name: "B", type: "BANK", status: "ACTIVE", companyId: null, companyName: null },
    ] as never);
    assert.equal(m.get("ARS")?.toString(), "1500");
  });
});
