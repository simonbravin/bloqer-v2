import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { canViewProjectCostControlReport } from "../project/project-nav-guards";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import type { TenantModuleSectionExcludedWarning } from "../tenant-modules/tenant-module-report-warnings";
import { ServiceContext, ServiceError } from "../types";
import { requireProjectAccess } from "../security/access";
import { resolveApprovedBudgetForProject } from "./report-budget-resolve";
import { sortByWbsCode } from "../budget/wbs-code-rules";
import { serializeMoneyDecimal } from "../finance/money-decimal";
import { validateResourceVarianceDates } from "../resources/resource-variance-filters";
import { assertBudgetCostGraph } from "../budget/budget-cost-graph";
import { parseFilterDate } from "./report-month";
import {
  STOCK_CONSUMPTION_UNAVAILABLE_WARNING,
  STOCK_CONSUMPTION_UNVALUED_WARNING,
} from "../inventory/stock-consumption-warnings";

export type MaterialReportFilters = {
  budgetId?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type MaterialWbsRow = {
  wbsNodeId: string;
  wbsCode: string;
  wbsName: string;
  budgetMaterial: string;
  consumedCost: string | null;
  variance: string | null;
  variancePct: string | null;
};

export type MaterialVarianceReport = {
  type: "REPORT";
  currency: string;
  projectId: string;
  budgetId: string;
  budgetName: string;
  byWbs: MaterialWbsRow[];
  totals: {
    budgetMaterial: string;
    consumedCost: string | null;
    variance: string | null;
  };
  warnings: string[];
  sectionsExcluded: TenantModuleSectionExcludedWarning[];
};

export type MaterialReportEmpty = { type: "NO_APPROVED_BUDGETS" };

export type MaterialReportResult = MaterialVarianceReport | MaterialReportEmpty;

function dateWhere(from?: string, to?: string) {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: parseFilterDate(from, false) } : {}),
    ...(to ? { lte: parseFilterDate(to, true) } : {}),
  };
}

async function materialWbsNodes(budgetId: string) {
  await assertBudgetCostGraph(budgetId);
  const rows = await prisma.wbsNode.findMany({
    where: { budgetId, type: "ITEM" },
    select: {
      id: true, code: true, name: true,
    },
  });
  return sortByWbsCode(rows);
}

export async function getMaterialVarianceReport(
  projectId: string,
  filters: MaterialReportFilters,
  ctx: ServiceContext,
): Promise<MaterialReportResult> {
  if (!canViewProjectCostControlReport(ctx.roles) && !can(ctx.roles, "VIEW", "PROJECTS")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver reporte de materiales");
  }
  validateResourceVarianceDates(filters);

  const project = await requireProjectAccess(projectId, ctx);
  const companyId = project.companyId ?? ctx.companyId;

  const budget = await resolveApprovedBudgetForProject(projectId, filters.budgetId, ctx);
  if (!budget) return { type: "NO_APPROVED_BUDGETS" };

  const gate = await getTenantModuleGate(ctx);
  const warnings: string[] = [
    "Compara el costo de los materiales consumidos con el presupuesto de materiales del APU.",
  ];
  const sectionsExcluded: TenantModuleSectionExcludedWarning[] = [];

  if (!gate.isEnabled("BUDGETS")) {
    throw new ServiceError("FORBIDDEN", "Presupuestos deshabilitado");
  }

  const wbsLeaves = await materialWbsNodes(budget.id);

  const costItems = await prisma.costItem.findMany({
    where: { budgetId: budget.id, wbsNode: { budgetId: budget.id, type: "ITEM" } },
    select: {
      wbsNodeId: true,
      quantity: true,
      analysisLines: {
        where: { budgetId: budget.id, category: "MATERIAL" },
        select: { totalCost: true },
      },
    },
  });

  const budgetMatMap = new Map<string, Prisma.Decimal>();
  for (const item of costItems) {
    const unitMat = item.analysisLines.reduce(
      (s, l) => s.plus(l.totalCost),
      new Prisma.Decimal(0),
    );
    budgetMatMap.set(item.wbsNodeId, unitMat.times(item.quantity));
  }

  const consumptionAvailable = gate.isEnabled("INVENTORY") && can(ctx.roles, "VIEW", "INVENTORY");
  const unvaluedWbs = new Set<string>();

  if (consumptionAvailable) {
    const movements = await prisma.stockMovement.findMany({
      where: {
        projectId,
        tenantId: ctx.tenantId,
        // StockMovement.companyId is NOT NULL.
        ...(companyId ? { companyId } : {}),
        status: "CONFIRMED",
        type: "OUT",
        sourceType: "CONSUMPTION",
        wbsNodeId: { in: wbsLeaves.map((row) => row.id) },
        ...(dateWhere(filters.dateFrom, filters.dateTo)
          ? { movementDate: dateWhere(filters.dateFrom, filters.dateTo) }
          : {}),
      },
      select: { wbsNodeId: true },
    });

    for (const m of movements) {
      // D-124: no currency or valuation-layer lineage exists on CONSUMPTION.
      // Even a recorded monetary value cannot be assumed to be budget currency.
      unvaluedWbs.add(m.wbsNodeId!);
    }
  } else if (!gate.isEnabled("INVENTORY")) {
    sectionsExcluded.push({
      module: "INVENTORY",
      section: "consumption",
      reason: "TENANT_MODULE_DISABLED",
    });
  }
  if (!consumptionAvailable) warnings.push(STOCK_CONSUMPTION_UNAVAILABLE_WARNING);
  else if (unvaluedWbs.size > 0) warnings.push(STOCK_CONSUMPTION_UNVALUED_WARNING);

  let totBudget = new Prisma.Decimal(0);
  let totConsumed: Prisma.Decimal | null = consumptionAvailable ? new Prisma.Decimal(0) : null;

  const byWbs: MaterialWbsRow[] = wbsLeaves.map((w) => {
    const budgetMat = budgetMatMap.get(w.id) ?? new Prisma.Decimal(0);
    const consumed = !consumptionAvailable || unvaluedWbs.has(w.id) ? null : new Prisma.Decimal(0);
    const variance = consumed === null ? null : budgetMat.minus(consumed);
    const pct = variance === null || budgetMat.isZero() ? null : variance.div(budgetMat).times(100).toFixed(2);
    totBudget = totBudget.plus(budgetMat);
    totConsumed = totConsumed === null || consumed === null ? null : totConsumed.plus(consumed);
    return {
      wbsNodeId: w.id,
      wbsCode: w.code,
      wbsName: w.name,
      budgetMaterial: serializeMoneyDecimal(budgetMat),
      consumedCost: consumed === null ? null : serializeMoneyDecimal(consumed),
      variance: variance === null ? null : serializeMoneyDecimal(variance),
      variancePct: pct,
    };
  });

  return {
    type: "REPORT",
    currency: budget.currency,
    projectId,
    budgetId: budget.id,
    budgetName: budget.name,
    byWbs,
    totals: {
      budgetMaterial: serializeMoneyDecimal(totBudget),
      consumedCost: totConsumed === null ? null : serializeMoneyDecimal(totConsumed),
      variance: totConsumed === null ? null : serializeMoneyDecimal(totBudget.minus(totConsumed)),
    },
    warnings,
    sectionsExcluded,
  };
}

export type MaterialLineWithoutProduct = {
  costAnalysisLineId: string;
  wbsCode: string;
  wbsName: string;
  description: string;
  unit: string;
  totalCost: string;
};

/** R-MAT-02: líneas APU MATERIAL sin product_id en presupuesto aprobado. */
export async function getMaterialLinesWithoutProduct(
  projectId: string,
  budgetId: string | undefined,
  ctx: ServiceContext,
): Promise<MaterialLineWithoutProduct[]> {
  const budget = await resolveApprovedBudgetForProject(projectId, budgetId, ctx);
  if (!budget) return [];
  await materialWbsNodes(budget.id);

  const lines = await prisma.costAnalysisLine.findMany({
    where: {
      budgetId: budget.id,
      category: "MATERIAL",
      productId: null,
      costItem: { budgetId: budget.id, wbsNode: { budgetId: budget.id, type: "ITEM" } },
      budget: { projectId, status: { in: ["APPROVED", "CLOSED"] } },
    },
    select: {
      id: true,
      description: true,
      unit: true,
      totalCost: true,
      costItem: {
        select: {
          wbsNode: { select: { code: true, name: true } },
        },
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  return lines.map((l) => ({
    costAnalysisLineId: l.id,
    wbsCode: l.costItem.wbsNode.code,
    wbsName: l.costItem.wbsNode.name,
    description: l.description,
    unit: l.unit,
    totalCost: l.totalCost.toFixed(2),
  }));
}
