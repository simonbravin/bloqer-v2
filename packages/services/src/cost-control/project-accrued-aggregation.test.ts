import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@bloqer/database";
import { groupAccruedAmountsByMonth } from "./project-accrued-aggregation";

describe("groupAccruedAmountsByMonth", () => {
  it("sums amounts in the same month", () => {
    const series = groupAccruedAmountsByMonth([
      { date: new Date("2025-03-15T12:00:00Z"), amount: new Prisma.Decimal(100) },
      { date: new Date("2025-03-20T00:00:00Z"), amount: new Prisma.Decimal(50) },
      { date: new Date("2025-04-01T00:00:00Z"), amount: new Prisma.Decimal(200) },
    ]);
    assert.equal(series.length, 2);
    assert.equal(series[0]!.periodKey, "2025-03");
    assert.equal(series[0]!.amount.toString(), "150");
    assert.equal(series[1]!.periodKey, "2025-04");
    assert.equal(series[1]!.amount.toString(), "200");
  });

  it("returns empty series for no entries", () => {
    assert.deepEqual(groupAccruedAmountsByMonth([]), []);
  });
});
