import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@bloqer/database";
import { resolveInvoiceLineMoney, parseDiscountPct } from "./invoice-line-money";
import { ServiceError } from "../types";

describe("resolveInvoiceLineMoney", () => {
  it("exclusive: net + tax (D-053)", () => {
    const r = resolveInvoiceLineMoney({
      quantity: new Prisma.Decimal("1"),
      unitPrice: new Prisma.Decimal("100"),
      taxRate: new Prisma.Decimal("21"),
    });
    assert.equal(r.unitPriceNet.toFixed(2), "100.00");
    assert.equal(r.lineSubtotal.toFixed(2), "100.00");
    assert.equal(r.lineTax.toFixed(2), "21.00");
    assert.equal(r.lineTotal.toFixed(2), "121.00");
  });

  it("exclusive 10% discount before IVA [D-093]", () => {
    const r = resolveInvoiceLineMoney({
      quantity: new Prisma.Decimal("1"),
      unitPrice: new Prisma.Decimal("100"),
      taxRate: new Prisma.Decimal("21"),
      discountPct: new Prisma.Decimal("10"),
    });
    assert.equal(r.unitPriceNet.toFixed(4), "100.0000");
    assert.equal(r.lineSubtotal.toFixed(2), "90.00");
    assert.equal(r.lineTax.toFixed(2), "18.90");
    assert.equal(r.lineTotal.toFixed(2), "108.90");
  });

  it("inclusive Factura B: gross 121 → persist net 100 (D-086)", () => {
    const r = resolveInvoiceLineMoney({
      quantity: new Prisma.Decimal("1"),
      unitPrice: new Prisma.Decimal("121"),
      taxRate: new Prisma.Decimal("21"),
      pricesIncludeTax: true,
    });
    assert.equal(r.unitPriceNet.toFixed(4), "100.0000");
    assert.equal(r.lineSubtotal.toFixed(2), "100.00");
    assert.equal(r.lineTax.toFixed(2), "21.00");
    assert.equal(r.lineTotal.toFixed(2), "121.00");
  });

  it("inclusive qty≠1: exclusive re-save from persisted net keeps totals", () => {
    const created = resolveInvoiceLineMoney({
      quantity: new Prisma.Decimal("3"),
      unitPrice: new Prisma.Decimal("10"),
      taxRate: new Prisma.Decimal("21"),
      pricesIncludeTax: true,
    });
    assert.equal(created.lineTotal.toFixed(2), "30.00");
    assert.equal(created.lineSubtotal.toFixed(2), "24.79");
    assert.equal(created.lineTax.toFixed(2), "5.21");

    const reSaved = resolveInvoiceLineMoney({
      quantity: new Prisma.Decimal("3"),
      unitPrice: created.unitPriceNet,
      taxRate: new Prisma.Decimal("21"),
      pricesIncludeTax: false,
    });
    assert.equal(reSaved.lineSubtotal.toFixed(2), created.lineSubtotal.toFixed(2));
    assert.equal(reSaved.lineTax.toFixed(2), created.lineTax.toFixed(2));
    assert.equal(reSaved.lineTotal.toFixed(2), created.lineTotal.toFixed(2));
  });

  it("inclusive + discount: persist list net; exclusive re-save keeps totals [D-093]", () => {
    const created = resolveInvoiceLineMoney({
      quantity: new Prisma.Decimal("3"),
      unitPrice: new Prisma.Decimal("10"),
      taxRate: new Prisma.Decimal("21"),
      discountPct: new Prisma.Decimal("10"),
      pricesIncludeTax: true,
    });
    const reSaved = resolveInvoiceLineMoney({
      quantity: new Prisma.Decimal("3"),
      unitPrice: created.unitPriceNet,
      taxRate: new Prisma.Decimal("21"),
      discountPct: new Prisma.Decimal("10"),
      pricesIncludeTax: false,
    });
    assert.equal(created.unitPriceNet.toFixed(4), reSaved.unitPriceNet.toFixed(4));
    assert.equal(reSaved.lineSubtotal.toFixed(2), created.lineSubtotal.toFixed(2));
    assert.equal(reSaved.lineTotal.toFixed(2), created.lineTotal.toFixed(2));
  });
});

describe("parseDiscountPct", () => {
  it("empty is zero", () => {
    assert.equal(parseDiscountPct("").toFixed(4), "0.0000");
    assert.equal(parseDiscountPct(null).toFixed(4), "0.0000");
  });

  it("rejects out of range with a Spanish validation error", () => {
    assert.throws(() => parseDiscountPct("101"), (err: unknown) => {
      assert.ok(err instanceof ServiceError);
      assert.equal(err.code, "VALIDATION");
      assert.match(err.message, /0 y 100/);
      return true;
    });
    assert.throws(() => parseDiscountPct("-1"), (err: unknown) => {
      assert.ok(err instanceof ServiceError);
      return true;
    });
  });
});
