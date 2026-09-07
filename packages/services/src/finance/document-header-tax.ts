import { Prisma } from "@bloqer/database";
import { calcDocumentHeaderTaxTotals } from "@bloqer/utils";
import { serializeMoneyDecimal, serializeRatePctDecimal } from "../finance/money-decimal";

/**
 * Header totals after line rollup ([D-112]):
 * total = Σ lineSubtotal + Σ lineTax(IVA) + percepción IIBB on net subtotal.
 */
export function headerTotalsWithIibbPerception(params: {
  lineSubtotals: Prisma.Decimal[];
  lineTaxes: Prisma.Decimal[];
  iibbPerceptionRate: Prisma.Decimal;
  /** When set, skip rate×subtotal and use this amount (centavo override). */
  iibbPerceptionAmountOverride?: Prisma.Decimal | null;
}): {
  subtotal: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  iibbPerceptionAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
} {
  const zero = new Prisma.Decimal(0);
  const subtotalSum = params.lineSubtotals.reduce((s, v) => s.plus(v), zero);
  const taxSum = params.lineTaxes.reduce((s, v) => s.plus(v), zero);
  const override =
    params.iibbPerceptionAmountOverride != null
      ? serializeMoneyDecimal(params.iibbPerceptionAmountOverride)
      : null;
  const t = calcDocumentHeaderTaxTotals({
    subtotal: serializeMoneyDecimal(subtotalSum),
    taxAmount: serializeMoneyDecimal(taxSum),
    iibbPerceptionRatePercent: serializeRatePctDecimal(params.iibbPerceptionRate),
    iibbPerceptionAmountOverride: override,
  });
  return {
    subtotal: new Prisma.Decimal(t.subtotal),
    taxAmount: new Prisma.Decimal(t.taxAmount),
    iibbPerceptionAmount: new Prisma.Decimal(t.iibbPerceptionAmount),
    totalAmount: new Prisma.Decimal(t.totalAmount),
  };
}
