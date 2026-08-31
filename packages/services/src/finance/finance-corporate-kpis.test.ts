import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { moneyMapFromRows } from "./finance-corporate-kpis.service";
import { buildTreasuryAttributionKpis } from "../treasury/treasury-attribution.service";

describe("finance-corporate-kpis helpers", () => {
  it("moneyMapFromRows builds decimal map by currency", () => {
    const m = moneyMapFromRows([
      { currency: "ARS", amount: "100.50" },
      { currency: "USD", amount: "20" },
    ]);
    assert.equal(m.get("ARS")?.toString(), "100.5");
    assert.equal(m.get("USD")?.toString(), "20");
  });

  it("hub row1 order: attribution then draft/expected keys are stable", () => {
    const attr = buildTreasuryAttributionKpis(
      {
        visible: true,
        byCurrency: [
          {
            currency: "ARS",
            projectOutflows: "10",
            corporateOutflows: "5",
            projectInflows: "0",
            corporateInflows: "0",
          },
        ],
      },
      { includeEmpty: true },
    );
    assert.deepEqual(
      attr.map((k) => k.key),
      ["tr_attr_project_out", "tr_attr_corp_out"],
    );
  });
});
