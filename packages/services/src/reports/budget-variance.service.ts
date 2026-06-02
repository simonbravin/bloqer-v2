import { Prisma, prisma } from "@bloqer/database";
import type { CostCategory } from "@bloqer/database";
import {
  getProjectCostControl,
  type CostControlFilters,
  type CostControlRow,
  type CostControlResult,
  type ProjectCostControlReport,
} from "../cost-control/cost-control.service";
import { canViewProjectCostControlReport } from "../project/project-nav-guards";
import { compareWbsCodes } from "../budget/wbs-code-rules";
import { ServiceContext, ServiceError } from "../types";

/** Capa de costo para comparar contra presupuesto ([D-021]). */
export type CostVarianceLayer = "exposure" | "committed" | "accrued" | "paid";

const LAYERS: CostVarianceLayer[] = ["exposure", "committed", "accrued", "paid"];

export function parseCostVarianceLayer(value?: string): CostVarianceLayer {
  if (value && LAYERS.includes(value as CostVarianceLayer)) {
    return value as CostVarianceLayer;
  }
  return "exposure";
}

export type VarianceStatus = "favorable" | "unfavorable" | "on_budget" | "no_baseline";

export type BudgetVarianceRow = CostControlRow & {
  actualCost: string;
  variancePct: string | null;
  varianceStatus: VarianceStatus;
};

export type BudgetVarianceTotalsMeta = {
  actualCost: string;
  variancePct: string | null;
};

export type BudgetVarianceReport = Omit<ProjectCostControlReport, "rows" | "totals"> & {
  costLayer: CostVarianceLayer;
  rows: BudgetVarianceRow[];
  totals: ProjectCostControlReport["totals"] & BudgetVarianceTotalsMeta;
};

export type BudgetVarianceFilters = CostControlFilters & {
  costLayer?: CostVarianceLayer;
};

export type BudgetVarianceResult =
  | BudgetVarianceReport
  | Extract<CostControlResult, { type: "BUDGET_SELECTION_REQUIRED" }>
  | Extract<CostControlResult, { type: "NO_APPROVED_BUDGETS" }>;

const VISIBLE_CATEGORIES: CostCategory[] = ["MATERIAL", "LABOR", "EQUIPMENT", "SUBCONTRACT"];

export type BudgetCompositionSlice = {
  category: CostCategory;
  label: string;
  amount: string;
  percent: string;
};

export type BudgetCompositionReport = {
  type: "COMPOSITION";
  projectId: string;
  budgetId: string;
  budgetName: string;
  budgetStatus: string;
  totalDirectCost: string;
  slices: BudgetCompositionSlice[];
};

export type BudgetCompositionResult =
  | BudgetCompositionReport
  | Extract<CostControlResult, { type: "BUDGET_SELECTION_REQUIRED" }>
  | Extract<CostControlResult, { type: "NO_APPROVED_BUDGETS" }>;

const CATEGORY_LABELS: Record<CostCategory, string> = {
  MATERIAL: "Materiales",
  LABOR: "Mano de obra",
  EQUIPMENT: "Equipos",
  SUBCONTRACT: "Subcontrato",
  OTHER: "Otros",
};

function getActualCost(row: CostControlRow, layer: CostVarianceLayer): string {
  switch (layer) {
    case "committed":
      return row.committedCost;
    case "accrued":
      return row.accruedCost;
    case "paid":
      return row.paidCost;
    default:
      return row.expectedCostExposure;
  }
}

function computeVariancePct(budgetTotal: string, actual: string): string | null {
  const b = parseFloat(budgetTotal);
  const a = parseFloat(actual);
  if (!Number.isFinite(b) || b === 0) return null;
  return (((a - b) / b) * 100).toFixed(2);
}

function resolveVarianceStatus(
  budgetTotal: string,
  variance: string,
  variancePct: string | null,
): VarianceStatus {
  const b = parseFloat(budgetTotal);
  if (!Number.isFinite(b) || b === 0) return "no_baseline";
  const v = parseFloat(variance);
  if (!Number.isFinite(v)) return "no_baseline";
  if (Math.abs(v) < 0.01) return "on_budget";
  if (variancePct !== null && Math.abs(parseFloat(variancePct)) < 0.5) return "on_budget";
  return v >= 0 ? "favorable" : "unfavorable";
}

function enrichRow(row: CostControlRow, layer: CostVarianceLayer): BudgetVarianceRow {
  const actualCost = getActualCost(row, layer);
  const budget = row.budgetTotalCost;
  const actual = parseFloat(actualCost);
  const b = parseFloat(budget);
  const variance = Number.isFinite(b) && Number.isFinite(actual)
    ? (b - actual).toFixed(2)
    : row.costVariance;
  const variancePct = computeVariancePct(budget, actualCost);
  return {
    ...row,
    costVariance: variance,
    actualCost,
    variancePct,
    varianceStatus: resolveVarianceStatus(budget, variance, variancePct),
  };
}

export async function getBudgetVarianceReport(
  projectId: string,
  filters: BudgetVarianceFilters,
  ctx: ServiceContext,
): Promise<BudgetVarianceResult> {
  if (!canViewProjectCostControlReport(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver reportes de costo");
  }

  const layer = filters.costLayer ?? "exposure";
  const base = await getProjectCostControl(
    projectId,
    {
      budgetId: filters.budgetId,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      wbsSearch: filters.wbsSearch,
    },
    ctx,
  );

  if (base.type !== "REPORT") return base;

  const rows = base.rows.map((r) => enrichRow(r, layer));

  let totActual = new Prisma.Decimal(0);
  let totBudget = new Prisma.Decimal(0);
  for (const r of rows) {
    totActual = totActual.plus(r.actualCost);
    totBudget = totBudget.plus(r.budgetTotalCost);
  }
  const totVariance = totBudget.minus(totActual).toFixed(2);
  const totVariancePct = computeVariancePct(totBudget.toFixed(2), totActual.toFixed(2));

  return {
    ...base,
    costLayer: layer,
    rows,
    totals: {
      ...base.totals,
      expectedCostExposure: layer === "exposure" ? base.totals.expectedCostExposure : totActual.toFixed(2),
      costVariance: totVariance,
      actualCost: totActual.toFixed(2),
      variancePct: totVariancePct,
    },
  };
}

async function resolveBudgetIdForProject(
  projectId: string,
  budgetId: string | undefined,
  ctx: ServiceContext,
): Promise<
  | { ok: true; budgetId: string; budgetName: string; budgetStatus: string }
  | { ok: false; result: Exclude<CostControlResult, ProjectCostControlReport> }
> {
  const probe = await getProjectCostControl(projectId, { budgetId }, ctx);
  if (probe.type === "NO_APPROVED_BUDGETS" || probe.type === "BUDGET_SELECTION_REQUIRED") {
    return { ok: false, result: probe };
  }
  return {
    ok: true,
    budgetId: probe.budgetId,
    budgetName: probe.budgetName,
    budgetStatus: probe.budgetStatus,
  };
}

export async function getBudgetCompositionReport(
  projectId: string,
  filters: Pick<CostControlFilters, "budgetId">,
  ctx: ServiceContext,
): Promise<BudgetCompositionResult> {
  if (!canViewProjectCostControlReport(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver reportes de costo");
  }

  const resolved = await resolveBudgetIdForProject(projectId, filters.budgetId, ctx);
  if (!resolved.ok) return resolved.result;

  const costItems = await prisma.costItem.findMany({
    where: { budgetId: resolved.budgetId },
    select: {
      quantity: true,
      analysisLines: {
        where: { category: { in: VISIBLE_CATEGORIES } },
        select: { category: true, totalCost: true },
      },
    },
  });

  const totals = new Map<CostCategory, Prisma.Decimal>();
  for (const cat of VISIBLE_CATEGORIES) totals.set(cat, new Prisma.Decimal(0));

  for (const item of costItems) {
    const qty = item.quantity;
    for (const line of item.analysisLines) {
      const prev = totals.get(line.category) ?? new Prisma.Decimal(0);
      totals.set(line.category, prev.plus(line.totalCost.times(qty)));
    }
  }

  const grand = [...totals.values()].reduce((s, v) => s.plus(v), new Prisma.Decimal(0));

  const slices: BudgetCompositionSlice[] = VISIBLE_CATEGORIES.map((category) => {
    const amount = totals.get(category) ?? new Prisma.Decimal(0);
    const percent = grand.isZero()
      ? "0.00"
      : amount.div(grand).times(100).toFixed(2);
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
    budgetId: resolved.budgetId,
    budgetName: resolved.budgetName,
    budgetStatus: resolved.budgetStatus,
    totalDirectCost: grand.toFixed(2),
    slices,
  };
}

export type WbsSubcontractBudgetHint = {
  wbsNodeId: string;
  code: string;
  name: string;
  unit: string;
  quantity: string;
  budgetSubcontractTotal: string;
  unitSubcontractCost: string;
};

/** WBS node ids with at least one line on an ACTIVE subcontract (R-SUB-01). */
export async function getWbsIdsWithActiveSubcontract(
  projectId: string,
  ctx: ServiceContext,
): Promise<Set<string>> {
  const lines = await prisma.subcontractLine.findMany({
    where: {
      subcontract: { projectId, tenantId: ctx.tenantId, status: "ACTIVE" },
      wbsNodeId: { not: null },
    },
    select: { wbsNodeId: true },
  });
  const ids = new Set<string>();
  for (const l of lines) {
    if (l.wbsNodeId) ids.add(l.wbsNodeId);
  }
  return ids;
}

/** Ítems WBS con monto de subcontrato en APU (para sugerencias al crear subcontrato). */
export async function getWbsSubcontractBudgetHints(
  projectId: string,
  ctx: ServiceContext,
  options?: { excludeWithActiveContract?: boolean },
): Promise<WbsSubcontractBudgetHint[]> {
  const wbsNodes = await prisma.wbsNode.findMany({
    where: {
      type: "ITEM",
      budget: { projectId, status: { in: ["APPROVED", "CLOSED"] } },
    },
    select: {
      id: true,
      code: true,
      name: true,
      costItem: {
        select: {
          unit: true,
          quantity: true,
          analysisLines: {
            where: { category: "SUBCONTRACT" },
            select: { totalCost: true },
          },
        },
      },
    },
  });

  const hints: WbsSubcontractBudgetHint[] = [];

  for (const node of wbsNodes) {
    const ci = node.costItem;
    if (!ci?.analysisLines.length) continue;

    const unitSub = ci.analysisLines.reduce(
      (sum, l) => sum.plus(l.totalCost),
      new Prisma.Decimal(0),
    );
    if (unitSub.isZero()) continue;

    const qty = ci.quantity;
    const total = unitSub.times(qty);

    hints.push({
      wbsNodeId: node.id,
      code: node.code,
      name: node.name,
      unit: ci.unit,
      quantity: qty.toString(),
      budgetSubcontractTotal: total.toFixed(2),
      unitSubcontractCost: unitSub.toFixed(2),
    });
  }

  if (options?.excludeWithActiveContract !== false) {
    const covered = await getWbsIdsWithActiveSubcontract(projectId, ctx);
    return hints.filter((h) => !covered.has(h.wbsNodeId)).sort((a, b) => compareWbsCodes(a.code, b.code));
  }

  return hints.sort((a, b) => compareWbsCodes(a.code, b.code));
}
