import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@bloqer/database";
import {
  applyNaturalRunningBalance,
  isDebitNormalAccountType,
  naturalBalance,
} from "./accounting-natural-balance";

describe("accounting-natural-balance [D-062]", () => {
  it("classifies debit vs credit normal types", () => {
    assert.equal(isDebitNormalAccountType("ASSET"), true);
    assert.equal(isDebitNormalAccountType("EXPENSE"), true);
    assert.equal(isDebitNormalAccountType("LIABILITY"), false);
    assert.equal(isDebitNormalAccountType("EQUITY"), false);
    assert.equal(isDebitNormalAccountType("INCOME"), false);
  });

  it("computes natural balance for asset and liability", () => {
    const d = new Prisma.Decimal("100");
    const c = new Prisma.Decimal("40");
    assert.equal(naturalBalance("ASSET", d, c).toString(), "60");
    assert.equal(naturalBalance("LIABILITY", d, c).toString(), "-60");
    assert.equal(naturalBalance("INCOME", d, c).toString(), "-60");
    assert.equal(naturalBalance("INCOME", new Prisma.Decimal(0), c).toString(), "40");
  });

  it("applies natural running balance steps", () => {
    let bal = new Prisma.Decimal(0);
    bal = applyNaturalRunningBalance("ASSET", bal, new Prisma.Decimal("100"), new Prisma.Decimal(0));
    assert.equal(bal.toString(), "100");
    bal = applyNaturalRunningBalance("ASSET", bal, new Prisma.Decimal(0), new Prisma.Decimal("30"));
    assert.equal(bal.toString(), "70");

    bal = new Prisma.Decimal(0);
    bal = applyNaturalRunningBalance("INCOME", bal, new Prisma.Decimal(0), new Prisma.Decimal("50"));
    assert.equal(bal.toString(), "50");
    bal = applyNaturalRunningBalance("INCOME", bal, new Prisma.Decimal("10"), new Prisma.Decimal(0));
    assert.equal(bal.toString(), "40");
  });
});
