import type { CostCategory } from "@bloqer/database";
import { Prisma } from "@bloqer/database";
import {
  COST_TYPE_LABELS_ES,
  COST_TYPE_ORDER,
  getProjectCostControl,
  type CostControlFilters,
  type CostControlResult,
  type CostControlRow,
} from "../cost-control/cost-control.service";
import { canViewProjectCostControlReport } from "../project/project-nav-guards";
import { ServiceContext, ServiceError } from "../types";
import { isPositiveMoneyDecimal } from "../finance/money-decimal";

export type ProjectCostCompositionSlice = {
  category: CostCategory;
  label: string;
  amount: string;
  percent: string;
};

export type ProjectCostCompositionReport = {
  type: "COMPOSITION";
  projectId: string;
  budgetId: string | null;
  budgetName: string | null;
  costLayer: "accrued";
  totalAccruedCost: string;
  slices: ProjectCostCompositionSlice[];
};

export type ProjectCostCompositionResult =
  | ProjectCostCompositionReport
  | Extract<CostControlResult, { type: "BUDGET_SELECTION_REQUIRED" }>
  | Extract<CostControlResult, { type: "NO_APPROVED_BUDGETS" }>;

/** One row of the "budget vs actual by CostCategory" comparison ([D-099]). */
export type CostTypeComparisonRow = {
  category: CostCategory;
  label: string;
  budgetTotalCost: string;
  accruedCost: string;
  expectedCostExposure: string;
};

export type CostTypeComparisonReport = {
  type: "COMPARISON";
  projectId: string;
  budgetId: string | null;
  budgetName: string | null;
  rows: CostTypeComparisonRow[];
};

/**
 * Pure: build a "planned vs accrued vs exposure" breakdown by CostCategory
 * ([D-099]). Zero-only rows are dropped so the chart only shows meaningful
 * categories. Ordering follows COST_TYPE_ORDER (MAT, LAB, EQP, SUB, OTHER).
 */
export function buildCostTypeComparisonFromRows(
  projectId: string,
  budgetId: string | null,
  budgetName: string | null,
  rows: CostControlRow[],
): CostTypeComparisonReport {
  const budget = new Map<CostCategory, Prisma.Decimal>();
  const accrued = new Map<CostCategory, Prisma.Decimal>();
  const exposure = new Map<CostCategory, Prisma.Decimal>();
  for (const cat of COST_TYPE_ORDER) {
    budget.set(cat, new Prisma.Decimal(0));
    accrued.set(cat, new Prisma.Decimal(0));
    exposure.set(cat, new Prisma.Decimal(0));
  }

  for (const row of rows) {
    for (const bucket of row.byCostType ?? []) {
      budget.set(bucket.costType, (budget.get(bucket.costType) ?? new Prisma.Decimal(0)).plus(bucket.budgetTotalCost));
      accrued.set(bucket.costType, (accrued.get(bucket.costType) ?? new Prisma.Decimal(0)).plus(bucket.accruedCost));
      exposure.set(bucket.costType, (exposure.get(bucket.costType) ?? new Prisma.Decimal(0)).plus(bucket.expectedCostExposure));
    }
  }

  const out: CostTypeComparisonRow[] = [];
  for (const cat of COST_TYPE_ORDER) {
    const b = budget.get(cat) ?? new Prisma.Decimal(0);
    const a = accrued.get(cat) ?? new Prisma.Decimal(0);
    const e = exposure.get(cat) ?? new Prisma.Decimal(0);
    if (b.isZero() && a.isZero() && e.isZero()) continue;
    out.push({
      category: cat,
      label: COST_TYPE_LABELS_ES[cat],
      budgetTotalCost: b.toFixed(2),
      accruedCost: a.toFixed(2),
      expectedCostExposure: e.toFixed(2),
    });
  }
  return {
    type: "COMPARISON",
    projectId,
    budgetId,
    budgetName,
    rows: out,
  };
}

/** Pure: suma `byCostType.accruedCost` tipado ([D-099]). */
export function buildAccruedCompositionFromRows(
  projectId: string,
  budgetId: string | null,
  budgetName: string | null,
  rows: CostControlRow[],
): ProjectCostCompositionReport {
  const totals = new Map<CostCategory, Prisma.Decimal>();
  for (const cat of COST_TYPE_ORDER) totals.set(cat, new Prisma.Decimal(0));

  for (const row of rows) {
    for (const bucket of row.byCostType ?? []) {
      const prev = totals.get(bucket.costType) ?? new Prisma.Decimal(0);
      totals.set(bucket.costType, prev.plus(bucket.accruedCost));
    }
  }

  const grand = [...totals.values()].reduce((s, v) => s.plus(v), new Prisma.Decimal(0));
  const slices: ProjectCostCompositionSlice[] = COST_TYPE_ORDER.map((category) => {
    const amount = totals.get(category) ?? new Prisma.Decimal(0);
    const percent = grand.isZero() ? "0.00" : amount.div(grand).times(100).toFixed(2);
    return {
      category,
      label: COST_TYPE_LABELS_ES[category],
      amount: amount.toFixed(2),
      percent,
    };
  }).filter((s) => isPositiveMoneyDecimal(s.amount));

  return {
    type: "COMPOSITION",
    projectId,
    budgetId,
    budgetName,
    costLayer: "accrued",
    totalAccruedCost: grand.toFixed(2),
    slices,
  };
}

/**
 * Mix real de costo devengado por `CostCategory` ([D-099]).
 * Suma buckets tipados; no prorratea por pesos APU.
 */
export async function getProjectCostCompositionReport(
  projectId: string,
  filters: Pick<CostControlFilters, "budgetId">,
  ctx: ServiceContext,
): Promise<ProjectCostCompositionResult> {
  if (!canViewProjectCostControlReport(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver composición de costos");
  }

  const cc = await getProjectCostControl(projectId, filters, ctx);
  if (cc.type !== "REPORT") return cc;

  return buildAccruedCompositionFromRows(projectId, cc.budgetId, cc.budgetName, cc.rows);
}
