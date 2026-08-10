import { Prisma } from "@bloqer/database";
import { calcLineAmountsFromGrossInclusive } from "@bloqer/utils";
import { toMoneyDecimal } from "./money-decimal";

/** Exclusive tax (neto + IVA) — same rule as AR/AP calcLine [D-053]. */
function calcLineExclusive(
  quantity: Prisma.Decimal,
  unitPriceNet: Prisma.Decimal,
  taxRate: Prisma.Decimal,
) {
  const lineSubtotal = toMoneyDecimal(quantity.times(unitPriceNet));
  const lineTax = toMoneyDecimal(lineSubtotal.times(taxRate).dividedBy(100));
  const lineTotal = toMoneyDecimal(lineSubtotal.plus(lineTax));
  return { lineSubtotal, lineTax, lineTotal };
}

/**
 * Resolve persisted unit price (net) + line money components ([D-053] / [D-086]).
 * When `pricesIncludeTax`, `unitPrice` is treated as gross (Factura B precio final).
 */
export function resolveInvoiceLineMoney(params: {
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  taxRate: Prisma.Decimal;
  pricesIncludeTax?: boolean;
}): {
  unitPriceNet: Prisma.Decimal;
  lineSubtotal: Prisma.Decimal;
  lineTax: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
} {
  if (!params.pricesIncludeTax) {
    const { lineSubtotal, lineTax, lineTotal } = calcLineExclusive(
      params.quantity,
      params.unitPrice,
      params.taxRate,
    );
    return {
      unitPriceNet: params.unitPrice,
      lineSubtotal,
      lineTax,
      lineTotal,
    };
  }

  const r = calcLineAmountsFromGrossInclusive({
    quantity: params.quantity.toString(),
    unitPriceGross: params.unitPrice.toString(),
    taxRatePercent: params.taxRate.toString(),
  });
  return {
    unitPriceNet: new Prisma.Decimal(r.unitPriceNet),
    lineSubtotal: new Prisma.Decimal(r.lineSubtotal),
    lineTax: new Prisma.Decimal(r.lineTax),
    lineTotal: new Prisma.Decimal(r.lineTotal),
  };
}
