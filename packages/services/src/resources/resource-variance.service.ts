import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { canViewProjectCostControlReport } from "../project/project-nav-guards";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import { ServiceContext, ServiceError } from "../types";
import { requireProjectAccess } from "../security/access";
import { resolveApprovedBudgetForProject } from "../reports/report-budget-resolve";
import { parseFilterDate } from "../reports/report-month";
import { sortByWbsCode } from "../budget/wbs-code-rules";
import { serializeMoneyDecimal } from "../finance/money-decimal";
import { validateResourceVarianceDates } from "./resource-variance-filters";
import { assertBudgetCurrency } from "../cost-control/comparison-currency";
import { assertBudgetCostGraph } from "../budget/budget-cost-graph";
import {
  asCostCategory,
  isResourceBoardCategory,
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
  currency: string;
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
    ...(from ? { gte: parseFilterDate(from, false) } : {}),
    // Inclusive end-of-day (UTC) — bare `new Date(YYYY-MM-DD)` cuts off the last day.
    ...(to ? { lte: parseFilterDate(to, true) } : {}),
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
  if (!isResourceBoardCategory(costCategory)) {
    throw new ServiceError("VALIDATION", "El tipo de recurso debe ser Mano de obra o Equipos");
  }
  if (!canViewProjectCostControlReport(ctx.roles) && !can(ctx.roles, "VIEW", "PROJECTS")) {
    throw new ServiceError(
      "FORBIDDEN",
      `Sin permisos para ver varianza de ${RESOURCE_BOARD_LABELS_ES[costCategory].toLowerCase()}`,
    );
  }
  validateResourceVarianceDates(filters);

  const gate = await getTenantModuleGate(ctx);
  if (!gate.isEnabled("BUDGETS") || !gate.isEnabled("PROJECTS")) {
    throw new ServiceError("FORBIDDEN", "Proyectos o presupuestos deshabilitados");
  }
  await requireProjectAccess(projectId, ctx);
  const budget = await resolveApprovedBudgetForProject(projectId, filters.budgetId, ctx);
  if (!budget) return { type: "NO_APPROVED_BUDGETS", costCategory };
  await assertBudgetCostGraph(budget.id);

  const category = asCostCategory(costCategory);
  const warnings: string[] = [
    `Presupuesto APU ${RESOURCE_BOARD_LABELS_ES[costCategory]} vs facturas proveedor emitidas tipadas (${category}), montos netos sin IVA (lineSubtotal; misma base que EDT / D-095).`,
  ];

  const wbsLeaves = sortByWbsCode(
    await prisma.wbsNode.findMany({
      where: { budgetId: budget.id, type: "ITEM" },
      select: { id: true, code: true, name: true },
    }),
  );

  const costItems = await prisma.costItem.findMany({
    where: { budgetId: budget.id, wbsNode: { budgetId: budget.id, type: "ITEM" } },
    select: {
      wbsNodeId: true,
      quantity: true,
      analysisLines: {
        where: { budgetId: budget.id, category },
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
  if (gate.isEnabled("AP") && can(ctx.roles, "VIEW", "AP")) {
    const lines = await prisma.supplierInvoiceLine.findMany({
      where: {
        invoice: {
          projectId,
          tenantId: ctx.tenantId,
          // SupplierInvoice.companyId is NOT NULL.
          ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
          status: "ISSUED",
          subcontractCertificationId: null,
          ...(dateWhere(filters.dateFrom, filters.dateTo)
            ? { issueDate: dateWhere(filters.dateFrom, filters.dateTo) }
            : {}),
        },
        wbsNodeId: { not: null },
        wbsNode: { budgetId: budget.id },
        OR: [
          { costType: category },
          { costType: null, costAnalysisLine: { budgetId: budget.id, category } },
          {
            AND: [
              { costType: null },
              {
                purchaseOrderLine: {
                  purchaseOrder: { projectId, tenantId: ctx.tenantId, ...(ctx.companyId ? { companyId: ctx.companyId } : {}) },
                  OR: [{ costType: category }, { costType: null, costAnalysisLine: { category } }],
                },
              },
            ],
          },
        ],
      },
      select: {
        wbsNodeId: true,
        lineSubtotal: true,
        costType: true,
        costAnalysisLine: { select: {
          budgetId: true, category: true,
          costItem: { select: { budgetId: true, wbsNodeId: true } },
        } },
        invoice: { select: { documentKind: true, currency: true } },
        purchaseOrderLine: {
          select: { costType: true, costAnalysisLine: { select: { category: true } } },
        },
      },
    });

    for (const line of lines) {
      if (!line.wbsNodeId) continue;
      if (line.costAnalysisLine && (
        line.costAnalysisLine.budgetId !== budget.id ||
        line.costAnalysisLine.costItem.budgetId !== budget.id ||
        line.costAnalysisLine.costItem.wbsNodeId !== line.wbsNodeId
      )) {
        throw new ServiceError("CONFLICT", "Hay documentos con vínculos de empresa, obra o presupuesto inconsistentes. Revisá su trazabilidad antes de consultar los costos.");
      }
      // D-110: an own APU hint wins over the OC fallback; never count one line in both boards.
      const sourceCategory = line.costType ?? line.costAnalysisLine?.category ??
        line.purchaseOrderLine?.costType ?? line.purchaseOrderLine?.costAnalysisLine?.category;
      if (sourceCategory !== category) continue;
      assertBudgetCurrency(budget.currency, line.invoice.currency);
      accruedMap.set(
        line.wbsNodeId,
        (accruedMap.get(line.wbsNodeId) ?? new Prisma.Decimal(0)).plus(
          line.invoice.documentKind === "CREDIT_NOTE" ? line.lineSubtotal.negated() : line.lineSubtotal,
        ),
      );
    }
  } else {
    warnings.push("AP no disponible: no se consulta el gasto facturado.");
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
    currency: budget.currency,
    byWbs,
    totals: {
      budgetCost: serializeMoneyDecimal(totBudget),
      accruedCost: serializeMoneyDecimal(totAccrued),
      variance: serializeMoneyDecimal(totBudget.minus(totAccrued)),
    },
    warnings,
  };
}
