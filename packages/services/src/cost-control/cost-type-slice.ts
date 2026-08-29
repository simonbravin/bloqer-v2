import { Prisma, type CostCategory } from "@bloqer/database";
import { COST_TYPE_ORDER } from "./cost-type";
import type {
  CostControlRow,
  CostControlTotals,
  CostTypeBucket,
  ProjectCostControlReport,
} from "./cost-control.service";

export function parseCostCategoryFilter(raw: string | undefined | null): CostCategory | undefined {
  if (!raw) return undefined;
  return COST_TYPE_ORDER.includes(raw as CostCategory) ? (raw as CostCategory) : undefined;
}

export function costTypeBucketHasActivity(b: CostTypeBucket): boolean {
  return (
    Number(b.budgetTotalCost) !== 0 ||
    Number(b.committedCost) !== 0 ||
    Number(b.accruedCost) !== 0 ||
    Number(b.paidCost) !== 0 ||
    Number(b.inventoryConsumedCost) !== 0 ||
    Number(b.openCommittedCost) !== 0
  );
}

function pctOf(num: string, den: string): string | null {
  const d = Number(den);
  if (!Number.isFinite(d) || d === 0) return null;
  const n = Number(num);
  if (!Number.isFinite(n)) return null;
  return ((n / d) * 100).toFixed(2);
}

function moneyMinus(a: string, b: string): string {
  return new Prisma.Decimal(a).minus(b).toFixed(2);
}

function moneyPlus(a: string, b: string): string {
  return new Prisma.Decimal(a).plus(b).toFixed(2);
}

function rowFromBucket(row: CostControlRow, bucket: CostTypeBucket): CostControlRow {
  const budget = bucket.budgetTotalCost;
  const remaining = moneyMinus(budget, bucket.expectedCostExposure);
  const budgetDec = new Prisma.Decimal(bucket.budgetTotalCost);
  const exposureDec = new Prisma.Decimal(bucket.expectedCostExposure);
  return {
    ...row,
    budgetTotalCost: budget,
    budgetTotalSale: "0",
    certifiedIssued: "0",
    certifiedApproved: "0",
    committedCost: bucket.committedCost,
    receivedCost: "0",
    accruedCost: bucket.accruedCost,
    paidCost: bucket.paidCost,
    inventoryConsumedCost: bucket.inventoryConsumedCost,
    openCommittedCost: bucket.openCommittedCost,
    expectedCostExposure: bucket.expectedCostExposure,
    costVariance: bucket.costVariance,
    remainingBudgetCost: remaining,
    projectedMargin: "0",
    qtyCommitted: "0",
    qtyReceived: "0",
    qtyConsumed: "0",
    pctPurchased: pctOf(bucket.committedCost, budget),
    pctReceived: null,
    pctPhysicalProgress: null,
    pctEconomic: pctOf(bucket.accruedCost, budget),
    pctExposure: pctOf(bucket.expectedCostExposure, budget),
    flags: {
      overBudget: exposureDec.gt(budgetDec) && !budgetDec.isZero(),
      overCertified: false,
      missingBudget: row.flags.missingBudget,
    },
    byCostType: [],
  };
}

export function sliceCostControlByCostType(
  sourceRows: CostControlRow[],
  costType: CostCategory,
): { rows: CostControlRow[]; totals: CostControlTotals } {
  const rows: CostControlRow[] = [];
  const acc = {
    budgetTotalCost: "0",
    committedCost: "0",
    accruedCost: "0",
    paidCost: "0",
    inventoryConsumedCost: "0",
    openCommittedCost: "0",
    expectedCostExposure: "0",
    costVariance: "0",
  };

  for (const row of sourceRows) {
    const bucket = (row.byCostType ?? []).find((b) => b.costType === costType);
    if (!bucket || !costTypeBucketHasActivity(bucket)) continue;
    rows.push(rowFromBucket(row, bucket));
    acc.budgetTotalCost = moneyPlus(acc.budgetTotalCost, bucket.budgetTotalCost);
    acc.committedCost = moneyPlus(acc.committedCost, bucket.committedCost);
    acc.accruedCost = moneyPlus(acc.accruedCost, bucket.accruedCost);
    acc.paidCost = moneyPlus(acc.paidCost, bucket.paidCost);
    acc.inventoryConsumedCost = moneyPlus(acc.inventoryConsumedCost, bucket.inventoryConsumedCost);
    acc.openCommittedCost = moneyPlus(acc.openCommittedCost, bucket.openCommittedCost);
    acc.expectedCostExposure = moneyPlus(acc.expectedCostExposure, bucket.expectedCostExposure);
    acc.costVariance = moneyPlus(acc.costVariance, bucket.costVariance);
  }

  return {
    rows,
    totals: {
      ...acc,
      budgetTotalSale: "0",
      certifiedIssued: "0",
      certifiedApproved: "0",
      receivedCost: "0",
      operationalProgressQty: "0",
      remainingBudgetCost: moneyMinus(acc.budgetTotalCost, acc.expectedCostExposure),
      projectedMargin: "0",
    },
  };
}

/**
 * Project a full EDT report onto one CostCategory ([D-099]).
 * Used by the EDT page KPIs, CSV and PDF so the three surfaces stay aligned.
 * Sale / certified / qty / physical % / unallocated cannot be sliced and are zeroed.
 */
export function sliceCostControlReportByCostType(
  result: ProjectCostControlReport,
  costType: CostCategory,
): ProjectCostControlReport {
  const { rows, totals } = sliceCostControlByCostType(result.rows, costType);
  return {
    ...result,
    rows,
    totals,
    unallocatedCommittedCost: "0",
    unallocatedReceivedCost: "0",
    unallocatedAccruedCost: "0",
    unallocatedPaidCost: "0",
    unallocatedInventoryConsumedCost: "0",
  };
}
