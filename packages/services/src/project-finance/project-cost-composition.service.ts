import { Prisma, prisma } from "@bloqer/database";
import type { CostCategory } from "@bloqer/database";
import {
  getProjectCostControl,
  type CostControlFilters,
  type CostControlResult,
} from "../cost-control/cost-control.service";
import { canViewProjectCostControlReport } from "../project/project-nav-guards";
import { ServiceContext, ServiceError } from "../types";

const VISIBLE_CATEGORIES: CostCategory[] = ["MATERIAL", "LABOR", "EQUIPMENT", "SUBCONTRACT"];

const CATEGORY_LABELS: Record<CostCategory, string> = {
  MATERIAL: "Materiales",
  LABOR: "Mano de obra",
  EQUIPMENT: "Equipos",
  SUBCONTRACT: "Subcontratos",
  OTHER: "Otros",
};

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

/**
 * Actual accrued cost composition by APU rubro (prorated from WBS item analysis lines).
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

  const wbsIds = cc.rows.map((r) => r.wbsNodeId);
  const costItems = await prisma.costItem.findMany({
    where: { wbsNodeId: { in: wbsIds } },
    select: {
      wbsNodeId: true,
      analysisLines: {
        where: { category: { in: VISIBLE_CATEGORIES } },
        select: { category: true, totalCost: true },
      },
    },
  });

  const weightsByWbs = new Map<string, Map<CostCategory, Prisma.Decimal>>();
  for (const item of costItems) {
    const catMap = new Map<CostCategory, Prisma.Decimal>();
    for (const line of item.analysisLines) {
      catMap.set(line.category, (catMap.get(line.category) ?? new Prisma.Decimal(0)).plus(line.totalCost));
    }
    weightsByWbs.set(item.wbsNodeId, catMap);
  }

  const totals = new Map<CostCategory, Prisma.Decimal>();
  for (const cat of VISIBLE_CATEGORIES) totals.set(cat, new Prisma.Decimal(0));

  for (const row of cc.rows) {
    const accrued = new Prisma.Decimal(row.accruedCost);
    if (accrued.lte(0)) continue;
    const weights = weightsByWbs.get(row.wbsNodeId);
    if (!weights || weights.size === 0) continue;
    const weightSum = [...weights.values()].reduce((s, v) => s.plus(v), new Prisma.Decimal(0));
    if (weightSum.isZero()) continue;
    for (const [cat, w] of weights) {
      const share = accrued.mul(w).div(weightSum);
      totals.set(cat, (totals.get(cat) ?? new Prisma.Decimal(0)).plus(share));
    }
  }

  const grand = [...totals.values()].reduce((s, v) => s.plus(v), new Prisma.Decimal(0));
  const slices: ProjectCostCompositionSlice[] = VISIBLE_CATEGORIES.map((category) => {
    const amount = totals.get(category) ?? new Prisma.Decimal(0);
    const percent = grand.isZero() ? "0.00" : amount.div(grand).times(100).toFixed(2);
    return {
      category,
      label: CATEGORY_LABELS[category],
      amount: amount.toFixed(2),
      percent,
    };
  }).filter((s) => parseFloat(s.amount) > 0);

  return {
    type: "COMPOSITION",
    projectId,
    budgetId: cc.budgetId,
    budgetName: cc.budgetName,
    costLayer: "accrued",
    totalAccruedCost: grand.toFixed(2),
    slices,
  };
}
