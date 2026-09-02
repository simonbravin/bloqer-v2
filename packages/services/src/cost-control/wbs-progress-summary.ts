import { Prisma } from "@bloqer/database";
import { roundToDecimals } from "@bloqer/utils";
import { remainingPhysicalPct } from "../jobsite-log/jobsite-log-guards";
import { serializeMoneyDecimal, serializeQtyDecimal } from "../finance/money-decimal";

const ZERO = new Prisma.Decimal(0);

export type WbsProgressSummary = {
  /** Sum of APPROVED libro incremental physicalPct. */
  physicalPctAcum: string;
  /** Sum of APPROVED libro quantityCompleted. */
  physicalQtyAcum: string;
  physicalRemainingPct: string;
  /** Sum of ISSUED|APPROVED certification currentQty. */
  certifiedQty: string;
  /** Sum of ISSUED|APPROVED certification periodAmount. */
  certifiedAmount: string;
  /** certifiedAmount / budgetTotalSale × 100; null if no sale base. */
  economicPctOfSale: string | null;
  remainingCertQty: string;
  /** committed / budgetTotalCost × 100; null if no cost base. */
  committedPctOfCost: string | null;
  accruedPctOfCost: string | null;
  expectedExposurePctOfCost: string | null;
};

function pctOf(part: Prisma.Decimal, base: Prisma.Decimal): string | null {
  if (base.isZero()) return null;
  return roundToDecimals(part.div(base).mul(100).toString(), 2);
}

/**
 * Derived progress triad for an EDT item (not persisted).
 * Physical from libro APPROVED; economic from client certs; cost % from D-021 layers.
 */
export function buildWbsProgressSummary(input: {
  physicalPctAcum: Prisma.Decimal | string | number;
  physicalQtyAcum: Prisma.Decimal | string | number;
  certifiedQty: Prisma.Decimal | string | number;
  certifiedAmount: Prisma.Decimal | string | number;
  budgetQty: Prisma.Decimal | string | number | null;
  budgetTotalSale: Prisma.Decimal | string | number | null;
  budgetTotalCost: Prisma.Decimal | string | number | null;
  committedCost: Prisma.Decimal | string | number | null;
  accruedCost: Prisma.Decimal | string | number | null;
  expectedCostExposure: Prisma.Decimal | string | number | null;
}): WbsProgressSummary {
  const physPct = new Prisma.Decimal(input.physicalPctAcum ?? 0);
  const physQty = new Prisma.Decimal(input.physicalQtyAcum ?? 0);
  const certQty = new Prisma.Decimal(input.certifiedQty ?? 0);
  const certAmt = new Prisma.Decimal(input.certifiedAmount ?? 0);
  const budgetQty = input.budgetQty != null ? new Prisma.Decimal(input.budgetQty) : ZERO;
  const sale = input.budgetTotalSale != null ? new Prisma.Decimal(input.budgetTotalSale) : ZERO;
  const cost = input.budgetTotalCost != null ? new Prisma.Decimal(input.budgetTotalCost) : ZERO;

  const remainingCert = Prisma.Decimal.max(ZERO, budgetQty.sub(certQty));

  // Cost % only when D-021 layers were resolved; null ≠ "0%".
  const costLayersAvailable =
    input.committedCost != null &&
    input.accruedCost != null &&
    input.expectedCostExposure != null &&
    input.budgetTotalCost != null;

  return {
    physicalPctAcum: roundToDecimals(physPct.toString(), 2),
    physicalQtyAcum: serializeQtyDecimal(physQty),
    physicalRemainingPct: remainingPhysicalPct(physPct.toString()),
    certifiedQty: serializeQtyDecimal(certQty),
    certifiedAmount: serializeMoneyDecimal(certAmt),
    economicPctOfSale: pctOf(certAmt, sale),
    remainingCertQty: serializeQtyDecimal(remainingCert),
    committedPctOfCost: costLayersAvailable
      ? pctOf(new Prisma.Decimal(input.committedCost!), cost)
      : null,
    accruedPctOfCost: costLayersAvailable
      ? pctOf(new Prisma.Decimal(input.accruedCost!), cost)
      : null,
    expectedExposurePctOfCost: costLayersAvailable
      ? pctOf(new Prisma.Decimal(input.expectedCostExposure!), cost)
      : null,
  };
}
