import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { canViewProjectCostControlReport } from "../project/project-nav-guards";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import type { TenantModuleSectionExcludedWarning } from "../tenant-modules/tenant-module-report-warnings";
import { ServiceContext, ServiceError } from "../types";
import { resolveApprovedBudgetForProject } from "./report-budget-resolve";

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
  consumedCost: string;
  variance: string;
  variancePct: string | null;
};

export type MaterialVarianceReport = {
  type: "REPORT";
  projectId: string;
  budgetId: string;
  budgetName: string;
  byWbs: MaterialWbsRow[];
  totals: {
    budgetMaterial: string;
    consumedCost: string;
    variance: string;
  };
  warnings: string[];
  sectionsExcluded: TenantModuleSectionExcludedWarning[];
};

export type MaterialReportEmpty = { type: "NO_APPROVED_BUDGETS" };

export type MaterialReportResult = MaterialVarianceReport | MaterialReportEmpty;

function dateWhere(from?: string, to?: string) {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: new Date(from) } : {}),
    ...(to ? { lte: new Date(to) } : {}),
  };
}

export async function getMaterialVarianceReport(
  projectId: string,
  filters: MaterialReportFilters,
  ctx: ServiceContext,
): Promise<MaterialReportResult> {
  if (!canViewProjectCostControlReport(ctx.roles) && !can(ctx.roles, "VIEW", "PROJECTS")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver reporte de materiales");
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const budget = await resolveApprovedBudgetForProject(projectId, filters.budgetId, ctx);
  if (!budget) return { type: "NO_APPROVED_BUDGETS" };

  const gate = await getTenantModuleGate(ctx);
  const warnings: string[] = [
    "R-MAT-01: consumo de stock (movimientos OUT CONSUMPTION) vs baseline MATERIAL del APU.",
  ];
  const sectionsExcluded: TenantModuleSectionExcludedWarning[] = [];

  if (!gate.isEnabled("BUDGETS")) {
    throw new ServiceError("FORBIDDEN", "Presupuestos deshabilitado");
  }

  const wbsLeaves = await prisma.wbsNode.findMany({
    where: { budgetId: budget.id, type: "ITEM" },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });

  const costItems = await prisma.costItem.findMany({
    where: { budgetId: budget.id, wbsNode: { type: "ITEM" } },
    select: {
      wbsNodeId: true,
      quantity: true,
      analysisLines: {
        where: { category: "MATERIAL" },
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

  const consumedByWbs = new Map<string, Prisma.Decimal>();

  if (gate.isEnabled("INVENTORY")) {
    const movements = await prisma.stockMovement.findMany({
      where: {
        projectId,
        tenantId: ctx.tenantId,
        status: "CONFIRMED",
        type: "OUT",
        sourceType: "CONSUMPTION",
        wbsNodeId: { not: null },
        ...(dateWhere(filters.dateFrom, filters.dateTo)
          ? { movementDate: dateWhere(filters.dateFrom, filters.dateTo) }
          : {}),
      },
      select: { wbsNodeId: true, quantity: true, unitCost: true, totalCost: true },
    });

    for (const m of movements) {
      const wbsId = m.wbsNodeId!;
      const total = m.totalCost ?? new Prisma.Decimal(0);
      const unit = m.unitCost ?? new Prisma.Decimal(0);
      const cost = total.isZero()
        ? new Prisma.Decimal(m.quantity).mul(unit)
        : new Prisma.Decimal(total);
      consumedByWbs.set(wbsId, (consumedByWbs.get(wbsId) ?? new Prisma.Decimal(0)).plus(cost));
    }
  } else {
    sectionsExcluded.push({
      module: "INVENTORY",
      section: "consumption",
      reason: "TENANT_MODULE_DISABLED",
    });
    warnings.push("Inventario deshabilitado: consumo en cero.");
  }

  let totBudget = new Prisma.Decimal(0);
  let totConsumed = new Prisma.Decimal(0);

  const byWbs: MaterialWbsRow[] = wbsLeaves.map((w) => {
    const budgetMat = budgetMatMap.get(w.id) ?? new Prisma.Decimal(0);
    const consumed = consumedByWbs.get(w.id) ?? new Prisma.Decimal(0);
    const variance = budgetMat.minus(consumed);
    const pct = budgetMat.isZero() ? null : variance.div(budgetMat).times(100).toFixed(2);
    totBudget = totBudget.plus(budgetMat);
    totConsumed = totConsumed.plus(consumed);
    return {
      wbsNodeId: w.id,
      wbsCode: w.code,
      wbsName: w.name,
      budgetMaterial: budgetMat.toFixed(2),
      consumedCost: consumed.toFixed(2),
      variance: variance.toFixed(2),
      variancePct: pct,
    };
  });

  return {
    type: "REPORT",
    projectId,
    budgetId: budget.id,
    budgetName: budget.name,
    byWbs,
    totals: {
      budgetMaterial: totBudget.toFixed(2),
      consumedCost: totConsumed.toFixed(2),
      variance: totBudget.minus(totConsumed).toFixed(2),
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

  const lines = await prisma.costAnalysisLine.findMany({
    where: {
      budgetId: budget.id,
      category: "MATERIAL",
      productId: null,
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
