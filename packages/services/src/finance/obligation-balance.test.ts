import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@bloqer/database";
import {
  computeObligationBalanceDue,
  effectiveObligationPaidAfterPayment,
  normalizeObligationBalanceDue,
} from "./obligation-balance";

describe("normalizeObligationBalanceDue", () => {
  it("returns zero for dust within 0.01 ARS", () => {
    assert.equal(normalizeObligationBalanceDue(new Prisma.Decimal("0.0022")).toString(), "0");
  });

  it("preserves open balances above tolerance", () => {
    assert.equal(normalizeObligationBalanceDue(new Prisma.Decimal("0.02")).toString(), "0.02");
  });
});

describe("effectiveObligationPaidAfterPayment", () => {
  it("writes off dust by capping paid to original", () => {
    const original = new Prisma.Decimal("34100");
    const newPaid = new Prisma.Decimal("34099.9978");
    assert.equal(
      effectiveObligationPaidAfterPayment(original, newPaid).toString(),
      "34100",
    );
  });

  it("keeps partial paid amount when balance remains open", () => {
    const original = new Prisma.Decimal("100");
    const newPaid = new Prisma.Decimal("40");
    assert.equal(effectiveObligationPaidAfterPayment(original, newPaid).toString(), "40");
  });
});

describe("computeObligationBalanceDue", () => {
  it("subtracts paid from original", () => {
    assert.equal(
      computeObligationBalanceDue(
        new Prisma.Decimal("100"),
        new Prisma.Decimal("40"),
      ).toString(),
      "60",
    );
  });
});
