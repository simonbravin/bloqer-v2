import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@bloqer/database";
import {
  computeObligationBalanceDue,
  effectiveObligationCreditedAfterCredit,
  effectiveObligationPaidAfterPayment,
  normalizeObligationBalanceDue,
} from "./obligation-balance";

describe("normalizeObligationBalanceDue", () => {
  it("returns zero for dust within 0.01 ARS", () => {
    assert.equal(normalizeObligationBalanceDue(new Prisma.Decimal("0.0022")).toString(), "0");
  });

  it("preserves a real cent (0.01) as open balance", () => {
    assert.equal(normalizeObligationBalanceDue(new Prisma.Decimal("0.01")).toString(), "0.01");
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

  it("subtracts paid and credited ([D-115])", () => {
    assert.equal(
      computeObligationBalanceDue(
        new Prisma.Decimal("1000"),
        new Prisma.Decimal("400"),
        new Prisma.Decimal("200"),
      ).toString(),
      "400",
    );
  });

  it("partial collection: two payments leave the remaining receivable balance (Phase 3)", () => {
    const original = new Prisma.Decimal("1000.00");
    const afterFirst = effectiveObligationPaidAfterPayment(
      original,
      new Prisma.Decimal("400.00"),
    );
    assert.equal(afterFirst.toString(), "400");
    assert.equal(computeObligationBalanceDue(original, afterFirst).toString(), "600");

    const afterSecond = effectiveObligationPaidAfterPayment(
      original,
      afterFirst.add(new Prisma.Decimal("350.00")),
    );
    assert.equal(afterSecond.toString(), "750");
    assert.equal(computeObligationBalanceDue(original, afterSecond).toString(), "250");
  });
});

describe("effectiveObligationCreditedAfterCredit", () => {
  it("writes off dust onto credited when settling", () => {
    const original = new Prisma.Decimal("100");
    const paid = new Prisma.Decimal("40");
    const credited = new Prisma.Decimal("59.997");
    assert.equal(
      effectiveObligationCreditedAfterCredit(original, paid, credited).toString(),
      "60",
    );
  });
});
