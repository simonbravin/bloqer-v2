import { Prisma } from "@bloqer/database";
import { compareDecimal, divideDecimal, multiplyDecimal, roundToDecimals } from "@bloqer/utils";

/** Percent of numerator/denominator × 100, or null when denominator is zero. */
export function pctOfBudget(num: Prisma.Decimal, den: Prisma.Decimal): string | null {
  try {
    if (compareDecimal(den.toString(), "0") === 0) return null;
    return roundToDecimals(
      multiplyDecimal(divideDecimal(num.toString(), den.toString(), 8), "100"),
      2,
    );
  } catch {
    return null;
  }
}

/**
 * Libro advance on EDT ([D-045]): incremental physicalPct when any APPROVED
 * line recorded it. Qty/budget only if the WBS never had physicalPct
 * (qty on gl=1 lines is operational evidence and can be 100% per day).
 */
export function pctPhysicalProgressFromLibro(input: {
  hasPhysicalPct: boolean;
  physicalPctAcum: Prisma.Decimal;
  operationalQty: Prisma.Decimal;
  budgetQty: Prisma.Decimal;
}): string | null {
  if (input.hasPhysicalPct) {
    return roundToDecimals(input.physicalPctAcum.toString(), 2);
  }
  return pctOfBudget(input.operationalQty, input.budgetQty);
}

/** Direct ISSUED invoices on a WBS that already has PO commitment inflate exposure. */
export function shouldWarnUnlinkedInvoiceAgainstPo(
  poCommitted: Prisma.Decimal,
  unlinkedAccrued: Prisma.Decimal,
): boolean {
  return (
    compareDecimal(poCommitted.toString(), "0") > 0 &&
    compareDecimal(unlinkedAccrued.toString(), "0") > 0
  );
}
