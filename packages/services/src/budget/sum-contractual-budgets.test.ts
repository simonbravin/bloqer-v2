import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@bloqer/database";
import {
  pickContractualBudgetCard,
  sumContractualBudgetsByCurrency,
} from "./sum-contractual-budgets";

const d = (n: number) => new Prisma.Decimal(n);

describe("sumContractualBudgetsByCurrency (BR-BUD-003)", () => {
  it("sums sale and cost of every phase in the same currency", () => {
    const sums = sumContractualBudgetsByCurrency([
      { currency: "ARS", totalSalePrice: d(1000), totalCost: d(700) },
      { currency: "ARS", totalSalePrice: d(250), totalCost: d(180) },
    ]);
    assert.equal(sums.length, 1);
    assert.equal(sums[0]!.currency, "ARS");
    assert.equal(sums[0]!.totalSalePrice.toString(), "1250");
    assert.equal(sums[0]!.totalCost.toString(), "880");
  });

  it("keeps currencies separate", () => {
    const sums = sumContractualBudgetsByCurrency([
      { currency: "USD", totalSalePrice: d(10), totalCost: d(8) },
      { currency: "ARS", totalSalePrice: d(100), totalCost: d(80) },
    ]);
    assert.deepEqual(
      sums.map((s) => s.currency),
      ["ARS", "USD"],
    );
    assert.equal(sums[0]!.totalSalePrice.toString(), "100");
    assert.equal(sums[1]!.totalSalePrice.toString(), "10");
  });

  it("returns empty when there are no contractual budgets", () => {
    assert.deepEqual(sumContractualBudgetsByCurrency([]), []);
  });
});

describe("pickContractualBudgetCard", () => {
  it("sums every phase and does not depend on row order", () => {
    const card = pickContractualBudgetCard([
      { currency: "ARS", totalSalePrice: d(250), totalCost: d(180) },
      { currency: "ARS", totalSalePrice: d(1000), totalCost: d(700) },
    ]);
    assert.equal(card?.totalSalePrice.toString(), "1250");
    assert.equal(card?.totalCost.toString(), "880");
    assert.equal(card?.currency, "ARS");
  });

  it("refuses a single number when phases use different currencies", () => {
    const card = pickContractualBudgetCard([
      { currency: "USD", totalSalePrice: d(10), totalCost: d(8) },
      { currency: "ARS", totalSalePrice: d(1000), totalCost: d(700) },
    ]);
    assert.equal(card, null);
  });

  it("returns null when there are no phases", () => {
    assert.equal(pickContractualBudgetCard([]), null);
  });
});
