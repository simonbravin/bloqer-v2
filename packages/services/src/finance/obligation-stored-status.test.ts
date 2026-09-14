import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@bloqer/database";
import { resolveObligationStoredStatus } from "./obligation-stored-status";

describe("resolveObligationStoredStatus", () => {
  it("returns PAID when balance is zero", () => {
    assert.equal(
      resolveObligationStoredStatus(new Prisma.Decimal("100"), new Prisma.Decimal("100")),
      "PAID",
    );
  });

  it("returns PAID when balance is sub-cent dust within tolerance", () => {
    assert.equal(
      resolveObligationStoredStatus(new Prisma.Decimal("34099.9978"), new Prisma.Decimal("34100")),
      "PAID",
    );
  });

  it("returns PARTIAL when partially paid", () => {
    assert.equal(
      resolveObligationStoredStatus(new Prisma.Decimal("40"), new Prisma.Decimal("100")),
      "PARTIAL",
    );
  });

  it("returns PARTIAL when credited without cash ([D-115])", () => {
    assert.equal(
      resolveObligationStoredStatus(
        new Prisma.Decimal(0),
        new Prisma.Decimal("100"),
        new Prisma.Decimal("40"),
      ),
      "PARTIAL",
    );
  });

  it("returns PAID when paid + credited settle original ([D-115])", () => {
    assert.equal(
      resolveObligationStoredStatus(
        new Prisma.Decimal("60"),
        new Prisma.Decimal("100"),
        new Prisma.Decimal("40"),
      ),
      "PAID",
    );
  });
});
