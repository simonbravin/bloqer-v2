import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@bloqer/database";
import { calcLine } from "./purchase-order-calc.service";

describe("calcLine pricesIncludeTax [D-086]", () => {
  it("treats unit price as gross when pricesIncludeTax is true", () => {
    const qty = new Prisma.Decimal("1");
    const gross = new Prisma.Decimal("1500000");
    const rate = new Prisma.Decimal("21");
    const { lineSubtotal, lineTax, lineTotal } = calcLine(qty, gross, rate, new Prisma.Decimal(0), true);
    assert.equal(lineTotal.toString(), "1500000");
    assert.equal(lineTax.plus(lineSubtotal).toString(), lineTotal.toString());
  });

  it("adds IVA on top when pricesIncludeTax is false", () => {
    const qty = new Prisma.Decimal("1");
    const net = new Prisma.Decimal("1500000");
    const rate = new Prisma.Decimal("21");
    const { lineTotal } = calcLine(qty, net, rate, new Prisma.Decimal(0), false);
    assert.equal(lineTotal.toString(), "1815000");
  });
});
