import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@bloqer/database";
import { pctOfBudget, pctPhysicalProgressFromLibro, shouldWarnUnlinkedInvoiceAgainstPo } from "./cost-control-pct";

describe("cost-control percentage helpers (D-098)", () => {
  it("returns null when budget is zero", () => {
    assert.equal(pctOfBudget(new Prisma.Decimal(100), new Prisma.Decimal(0)), null);
  });

  it("computes purchased / exposure pct", () => {
    assert.equal(pctOfBudget(new Prisma.Decimal(50), new Prisma.Decimal(100)), "50.00");
    assert.equal(pctOfBudget(new Prisma.Decimal(110), new Prisma.Decimal(100)), "110.00");
  });

  it("received % uses money vs budget (not qty on gl=1)", () => {
    const received = new Prisma.Decimal("793400");
    const budget = new Prisma.Decimal("1768650");
    assert.equal(pctOfBudget(received, budget), "44.86");
  });

  it("libro % wins over qty/budget when physicalPct was recorded", () => {
    assert.equal(
      pctPhysicalProgressFromLibro({
        hasPhysicalPct: true,
        physicalPctAcum: new Prisma.Decimal("50"),
        operationalQty: new Prisma.Decimal("2"),
        budgetQty: new Prisma.Decimal("1"),
      }),
      "50.00",
    );
  });

  it("falls back to qty/budget when the WBS never recorded physicalPct", () => {
    assert.equal(
      pctPhysicalProgressFromLibro({
        hasPhysicalPct: false,
        physicalPctAcum: new Prisma.Decimal(0),
        operationalQty: new Prisma.Decimal("2.5"),
        budgetQty: new Prisma.Decimal(10),
      }),
      "25.00",
    );
  });

  it("warns only when a PO commitment coexists with unlinked accrued", () => {
    assert.equal(
      shouldWarnUnlinkedInvoiceAgainstPo(new Prisma.Decimal("793400"), new Prisma.Decimal("1586800")),
      true,
    );
    assert.equal(
      shouldWarnUnlinkedInvoiceAgainstPo(new Prisma.Decimal(0), new Prisma.Decimal("500")),
      false,
    );
    assert.equal(
      shouldWarnUnlinkedInvoiceAgainstPo(new Prisma.Decimal("100"), new Prisma.Decimal(0)),
      false,
    );
  });
});
