import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@bloqer/database";
import { calcLine } from "../ap/supplier-invoice-calc.service";

describe("calcLine money rounding [D-053]", () => {
  it("rounds subtotal, tax and total to 2 dp half-up", () => {
    const qty = new Prisma.Decimal("3");
    const price = new Prisma.Decimal("10.005");
    const tax = new Prisma.Decimal("21");
    const { lineSubtotal, lineTax, lineTotal } = calcLine(qty, price, tax);
    // 3 * 10.005 = 30.015 → 30.02
    assert.equal(lineSubtotal.toString(), "30.02");
    // 30.02 * 0.21 = 6.3042 → 6.30
    assert.equal(lineTax.toString(), "6.3");
    // 30.02 + 6.30 = 36.32
    assert.equal(lineTotal.toString(), "36.32");
  });

  it("keeps header-sum identity for simple lines", () => {
    const a = calcLine(new Prisma.Decimal("1"), new Prisma.Decimal("100"), new Prisma.Decimal("0"));
    const b = calcLine(new Prisma.Decimal("1"), new Prisma.Decimal("50.555"), new Prisma.Decimal("0"));
    const sum = a.lineTotal.plus(b.lineTotal);
    assert.equal(sum.toString(), "150.56"); // 100 + 50.56
  });
});
