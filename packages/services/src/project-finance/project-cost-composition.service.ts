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
