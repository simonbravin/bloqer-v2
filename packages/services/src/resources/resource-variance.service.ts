import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { canViewProjectCostControlReport } from "../project/project-nav-guards";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import { ServiceContext, ServiceError } from "../types";
import { requireProjectInTenant } from "../project/require-project-in-tenant";
import { resolveApprovedBudgetForProject } from "../reports/report-budget-resolve";
import { sortByWbsCode } from "../budget/wbs-code-rules";
import { serializeMoneyDecimal } from "../finance/money-decimal";
import {
  asCostCategory,
  RESOURCE_BOARD_LABELS_ES,
  type ResourceBoardCategory,
} from "./resource-board-pure";

export type ResourceVarianceFilters = {
  budgetId?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type ResourceWbsVarianceRow = {
  wbsNodeId: string;
  wbsCode: string;
  wbsName: string;
  budgetCost: string;
  accruedCost: string;
  variance: string;
  variancePct: string | null;
};

export type ResourceVarianceReport = {
  type: "REPORT";
  costCategory: ResourceBoardCategory;
  categoryLabel: string;
  projectId: string;
  budgetId: string;
  budgetName: string;
  byWbs: ResourceWbsVarianceRow[];
  totals: {
    budgetCost: string;
    accruedCost: string;
    variance: string;
  };
  warnings: string[];
};

export type ResourceVarianceEmpty = {
  type: "NO_APPROVED_BUDGETS";
  costCategory: ResourceBoardCategory;
};

export type ResourceVarianceResult = ResourceVarianceReport | ResourceVarianceEmpty;

function dateWhere(from?: string, to?: string) {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: new Date(from) } : {}),
    ...(to ? { lte: new Date(to) } : {}),
  };
}

/**
 * Budget APU (LAB|EQP) vs accrued from ISSUED supplier invoices typed to that category.
 * No inventory axis — unlike materials variance.
 */
export async function getResourceVarianceReport(
  projectId: string,
  costCategory: ResourceBoardCategory,
  filters: ResourceVarianceFilters,
  ctx: ServiceContext,
): Promise<ResourceVarianceResult> {
  if (!canViewProjectCostControlReport(ctx.roles) && !can(ctx.roles, "VIEW", "PROJECTS")) {
    throw new ServiceError(
      "FORBIDDEN",
      `Sin permisos para ver varianza de ${RESOURCE_BOARD_LABELS_ES[costCategory].toLowerCase()}`,
    );
  }

  await requireProjectInTenant(projectId, ctx.tenantId);

  const budget = await resolveApprovedBudgetForProject(projectId, filters.budgetId, ctx);
  if (!budget) return { type: "NO_APPROVED_BUDGETS", costCategory };

  const gate = await getTenantModuleGate(ctx);
  if (!gate.isEnabled("BUDGETS")) {
    throw new ServiceError("FORBIDDEN", "Presupuestos deshabilitado");
  }

  const category = asCostCategory(costCategory);
  const warnings: string[] = [
    `Presupuesto APU ${RESOURCE_BOARD_LABELS_ES[costCategory]} vs facturas proveedor emitidas tipadas (${category}).`,
  ];

  const wbsLeaves = sortByWbsCode(
    await prisma.wbsNode.findMany({
      where: { budgetId: budget.id, type: "ITEM" },
      select: { id: true, code: true, name: true },
    }),
  );

  const costItems = await prisma.costItem.findMany({
    where: { budgetId: budget.id, wbsNode: { type: "ITEM" } },
    select: {
      wbsNodeId: true,
      quantity: true,
      analysisLines: {
        where: { category },
        select: { totalCost: true },
      },
    },
  });

  const budgetMap = new Map<string, Prisma.Decimal>();
  for (const item of costItems) {
    const unit = item.analysisLines.reduce((s, l) => s.plus(l.totalCost), new Prisma.Decimal(0));
    budgetMap.set(item.wbsNodeId, unit.times(item.quantity));
  }

  const accruedMap = new Map<string, Prisma.Decimal>();
  if (gate.isEnabled("AP")) {
    const lines = await prisma.supplierInvoiceLine.findMany({
      where: {
        invoice: {
          projectId,
          tenantId: ctx.tenantId,
          status: "ISSUED",
          subcontractCertificationId: null,
          ...(dateWhere(filters.dateFrom, filters.dateTo)
            ? { issueDate: dateWhere(filters.dateFrom, filters.dateTo) }
            : {}),
        },
        wbsNodeId: { not: null },
        OR: [
          { costType: category },
          {
            purchaseOrderLine: {
              OR: [{ costType: category }, { costAnalysisLine: { category } }],
            },
          },
        ],
      },
      select: {
        wbsNodeId: true,
        lineSubtotal: true,
        costType: true,
        purchaseOrderLine: {
          select: { costType: true, costAnalysisLine: { select: { category: true } } },
        },
      },
    });

    for (const line of lines) {
      if (!line.wbsNodeId) continue;
      const resolved: string =
        line.costType ??
        line.purchaseOrderLine?.costType ??
        line.purchaseOrderLine?.costAnalysisLine?.category ??
        "";
      if (resolved !== category) continue;
      accruedMap.set(
        line.wbsNodeId,
        (accruedMap.get(line.wbsNodeId) ?? new Prisma.Decimal(0)).plus(line.lineSubtotal),
      );
    }
  } else {
    warnings.push("Módulo AP deshabilitado: no se calcula el gasto facturado.");
  }

  const byWbs: ResourceWbsVarianceRow[] = [];
  let totBudget = new Prisma.Decimal(0);
  let totAccrued = new Prisma.Decimal(0);

  for (const w of wbsLeaves) {
    const budgetCost = budgetMap.get(w.id) ?? new Prisma.Decimal(0);
    const accruedCost = accruedMap.get(w.id) ?? new Prisma.Decimal(0);
    if (budgetCost.isZero() && accruedCost.isZero()) continue;
    const variance = budgetCost.minus(accruedCost);
    const variancePct = budgetCost.greaterThan(0)
      ? variance.div(budgetCost).times(100).toFixed(2)
      : null;
    byWbs.push({
      wbsNodeId: w.id,
      wbsCode: w.code,
      wbsName: w.name,
      budgetCost: serializeMoneyDecimal(budgetCost),
      accruedCost: serializeMoneyDecimal(accruedCost),
      variance: serializeMoneyDecimal(variance),
      variancePct,
    });
    totBudget = totBudget.plus(budgetCost);
    totAccrued = totAccrued.plus(accruedCost);
  }

  return {
    type: "REPORT",
    costCategory,
    categoryLabel: RESOURCE_BOARD_LABELS_ES[costCategory],
    projectId,
    budgetId: budget.id,
    budgetName: budget.name,
    byWbs,
    totals: {
      budgetCost: serializeMoneyDecimal(totBudget),
      accruedCost: serializeMoneyDecimal(totAccrued),
      variance: serializeMoneyDecimal(totBudget.minus(totAccrued)),
    },
    warnings,
  };
}
