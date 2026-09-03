import { Prisma, prisma, type UserRole } from "@bloqer/database";
import { getProjectCostControl } from "../cost-control/cost-control.service";
import type { AvailableBudget } from "../cost-control/cost-control-types";
import { serializeMoneyDecimal } from "../finance/money-decimal";
import { getProjectOverheadAmount } from "../finance/project-overhead.service";
import { canViewProjectCostControlReport } from "../project/project-nav-guards";
import { requireProjectInTenant } from "../project/require-project-in-tenant";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import { ServiceContext, ServiceError } from "../types";
import { selectGgItemIds } from "./gg-wbs-detect";
import {
  listApprovedBudgetsForProject,
  resolveApprovedBudgetForProject,
} from "./report-budget-resolve";

export type ProjectGgOverviewFilters = {
  budgetId?: string;
};

export type ProjectGgPartidaRow = {
  wbsNodeId: string;
  wbsCode: string;
  wbsName: string;
  budgetTotalCost: string;
  committedCost: string;
  accruedCost: string;
  openCommittedCost: string;
  paidCost: string;
};

export type ProjectGgUnallocatedDoc = {
  documentType: "PO_LINE" | "SUPPLIER_INVOICE";
  documentCode: string;
  supplierName: string;
  description: string;
  amount: string;
};

export type ProjectGgOverviewReport = {
  type: "REPORT";
  projectId: string;
  budgetId: string;
  budgetName: string;
  currency: string;
  availableBudgets: AvailableBudget[];
  summary: {
    budgetedGg: string;
    accruedOnGgPartidas: string;
    openCommittedOnGgPartidas: string;
    unallocatedCommitted: string;
    unallocatedAccrued: string;
    companyOverhead: string | null;
    companyOverheadVisible: boolean;
    /** False when GG empresa currency ≠ budget currency (shown but not in spentTotal). */
    companyOverheadIncludedInSpent: boolean;
    /** Devengado partidas GG + devengado sin EDT + GG empresa (si incluida). */
    spentTotal: string;
    remainingVsBudget: string;
    spentPctOfBudget: string | null;
  };
  ggPartidas: ProjectGgPartidaRow[];
  unallocatedDocuments: ProjectGgUnallocatedDoc[];
  /** Actionable / risk notices (yellow). */
  warnings: string[];
  /** Informational copy (not failures). */
  notes: string[];
};

export type ProjectGgOverviewEmpty = {
  type: "NO_APPROVED_BUDGETS";
  availableBudgets: AvailableBudget[];
};

export type ProjectGgOverviewBudgetPick = {
  type: "BUDGET_SELECTION_REQUIRED";
  availableBudgets: AvailableBudget[];
};

export type ProjectGgOverviewResult =
  | ProjectGgOverviewReport
  | ProjectGgOverviewEmpty
  | ProjectGgOverviewBudgetPick;

const PO_COMMITTED = ["CONFIRMED", "PARTIALLY_RECEIVED", "RECEIVED"] as const;

/** Net / company GG — OWNER|ADMIN [D-013], same as rentabilidad. */
function canViewCompanyGg(roles: UserRole[]): boolean {
  return roles.includes("OWNER") || roles.includes("ADMIN");
}

function pctOf(num: Prisma.Decimal, den: Prisma.Decimal): string | null {
  if (den.isZero()) return null;
  return num.div(den).times(100).toFixed(2);
}

function toAvailableBudgets(
  rows: Array<{ id: string; name: string; status: string }>,
): AvailableBudget[] {
  return rows.map((b) => ({ id: b.id, name: b.name, status: b.status }));
}

/**
 * Project report: presupuesto GG (partidas detectadas por nombre) vs
 * gastado en esas partidas + documentos sin EDT + GG empresa imputados.
 *
 * Requires cost-control view (same data plane as EDT); do not call getProjectCostControl
 * for procurement-only roles — that service forbids them.
 */
export async function getProjectGgOverviewReport(
  projectId: string,
  filters: ProjectGgOverviewFilters,
  ctx: ServiceContext,
): Promise<ProjectGgOverviewResult> {
  if (!canViewProjectCostControlReport(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver el reporte de gastos generales de obra");
  }

  const project = await requireProjectInTenant(projectId, ctx.tenantId);
  const approved = await listApprovedBudgetsForProject(projectId, ctx);
  const availableBudgets = toAvailableBudgets(approved);

  if (approved.length === 0) {
    return { type: "NO_APPROVED_BUDGETS", availableBudgets };
  }

  if (!filters.budgetId && approved.length > 1) {
    // Align with EDT: force explicit pick when several approved/closed budgets exist.
    return { type: "BUDGET_SELECTION_REQUIRED", availableBudgets };
  }

  if (filters.budgetId && !approved.some((b) => b.id === filters.budgetId)) {
    throw new ServiceError("NOT_FOUND", "Presupuesto no encontrado o no está aprobado/cerrado");
  }

  const budget = await resolveApprovedBudgetForProject(projectId, filters.budgetId, ctx);
  if (!budget) {
    return { type: "NO_APPROVED_BUDGETS", availableBudgets };
  }

  const warnings: string[] = [];
  const notes: string[] = [];
  const gate = await getTenantModuleGate(ctx);

  const [cc, allWbs] = await Promise.all([
    getProjectCostControl(projectId, { budgetId: budget.id }, ctx),
    prisma.wbsNode.findMany({
      where: { budgetId: budget.id },
      select: { id: true, parentId: true, type: true, code: true, name: true },
    }),
  ]);

  if (cc.type === "NO_APPROVED_BUDGETS") {
    return { type: "NO_APPROVED_BUDGETS", availableBudgets };
  }
  if (cc.type === "BUDGET_SELECTION_REQUIRED") {
    return { type: "BUDGET_SELECTION_REQUIRED", availableBudgets: cc.availableBudgets };
  }

  const currency = budget.currency;
  const ggItemIds = selectGgItemIds(allWbs);
  if (ggItemIds.size === 0) {
    warnings.push(
      "No se detectaron partidas de GG/indirectos por nombre. Nombrá un grupo o ítem con «Gastos generales», «Indirectos» o «GG» para armar el presupuesto GG.",
    );
  } else {
    notes.push(
      `Presupuesto GG = suma de ${ggItemIds.size} partida(s) detectadas por nombre/código (o grupo padre). No hay flag persistido de «partida GG» todavía.`,
    );
  }

  const ggPartidas: ProjectGgPartidaRow[] = [];
  let budgetedGg = new Prisma.Decimal(0);
  let accruedOnGg = new Prisma.Decimal(0);
  let openOnGg = new Prisma.Decimal(0);

  for (const row of cc.rows) {
    if (!ggItemIds.has(row.wbsNodeId)) continue;
    budgetedGg = budgetedGg.add(row.budgetTotalCost);
    accruedOnGg = accruedOnGg.add(row.accruedCost);
    openOnGg = openOnGg.add(row.openCommittedCost);
    ggPartidas.push({
      wbsNodeId: row.wbsNodeId,
      wbsCode: row.wbsCode,
      wbsName: row.wbsName,
      budgetTotalCost: row.budgetTotalCost,
      committedCost: row.committedCost,
      accruedCost: row.accruedCost,
      openCommittedCost: row.openCommittedCost,
      paidCost: row.paidCost,
    });
  }

  const unallocatedCommitted = new Prisma.Decimal(cc.unallocatedCommittedCost);
  const unallocatedAccrued = new Prisma.Decimal(cc.unallocatedAccruedCost);
  if (unallocatedCommitted.gt(0) || unallocatedAccrued.gt(0)) {
    warnings.push(
      "Hay costos de obra sin partida EDT: el Total gastado incluye solo el devengado sin EDT (no el comprometido abierto). Conviene reclasificar a una partida.",
    );
  }

  const unallocatedDocuments = await loadUnallocatedDocuments(
    projectId,
    ctx,
    gate.isEnabled("PROCUREMENT"),
    gate.isEnabled("AP"),
  );

  if (
    (unallocatedCommitted.gt(0) || unallocatedAccrued.gt(0)) &&
    unallocatedDocuments.length === 0
  ) {
    warnings.push(
      "Hay montos sin asignar a partida en EDT, pero el listado de OC/factura con WBS null está vacío (p. ej. WBS de otro presupuesto). Revisá EDT → bloque no asignado.",
    );
  }

  const companyOverheadVisible = canViewCompanyGg(ctx.roles);
  let companyOverhead: string | null = null;
  let includeCompanyInSpent = false;
  if (companyOverheadVisible && project.companyId && gate.isEnabled("AP")) {
    const oh = await getProjectOverheadAmount(
      projectId,
      project.companyId,
      new Prisma.Decimal(cc.totals.accruedCost),
      ctx,
      currency,
    );
    const overheadCurrency = oh.allocationMode === "AUTO_WEIGHT" ? "ARS" : oh.currency;
    companyOverhead = oh.totalOverhead;
    if (overheadCurrency === currency) {
      includeCompanyInSpent = true;
    } else {
      warnings.push(
        `GG empresa en ${overheadCurrency} no se suma al Total gastado (presupuesto en ${currency}).`,
      );
    }
    if (oh.allocationMode === "AUTO_WEIGHT") {
      for (const w of oh.autoWeightWarnings) {
        if (!warnings.includes(w)) warnings.push(w);
      }
    } else if (oh.manualRowsExcluded > 0) {
      warnings.push(
        `Hay ${oh.manualRowsExcluded} imputación(es) manual(es) de GG en otra moneda; no entran en este total.`,
      );
    }
  } else if (!companyOverheadVisible) {
    notes.push("GG de empresa imputados: visibles solo para OWNER o ADMIN (igual que margen neto).");
  }

  const companyDec = companyOverhead ? new Prisma.Decimal(companyOverhead) : new Prisma.Decimal(0);
  const spentTotal = accruedOnGg
    .add(unallocatedAccrued)
    .add(includeCompanyInSpent ? companyDec : new Prisma.Decimal(0));
  const remaining = budgetedGg.minus(spentTotal);

  return {
    type: "REPORT",
    projectId,
    budgetId: cc.budgetId,
    budgetName: cc.budgetName,
    currency,
    availableBudgets,
    summary: {
      budgetedGg: serializeMoneyDecimal(budgetedGg),
      accruedOnGgPartidas: serializeMoneyDecimal(accruedOnGg),
      openCommittedOnGgPartidas: serializeMoneyDecimal(openOnGg),
      unallocatedCommitted: serializeMoneyDecimal(unallocatedCommitted),
      unallocatedAccrued: serializeMoneyDecimal(unallocatedAccrued),
      companyOverhead: companyOverheadVisible ? serializeMoneyDecimal(companyDec) : null,
      companyOverheadVisible,
      companyOverheadIncludedInSpent: includeCompanyInSpent,
      spentTotal: serializeMoneyDecimal(spentTotal),
      remainingVsBudget: serializeMoneyDecimal(remaining),
      spentPctOfBudget: pctOf(spentTotal, budgetedGg),
    },
    ggPartidas,
    unallocatedDocuments,
    warnings,
    notes,
  };
}

async function loadUnallocatedDocuments(
  projectId: string,
  ctx: ServiceContext,
  procEnabled: boolean,
  apEnabled: boolean,
): Promise<ProjectGgUnallocatedDoc[]> {
  const docs: ProjectGgUnallocatedDoc[] = [];

  if (procEnabled) {
    const poLines = await prisma.purchaseOrderLine.findMany({
      where: {
        wbsNodeId: null,
        purchaseOrder: {
          projectId,
          tenantId: ctx.tenantId,
          status: { in: [...PO_COMMITTED] },
        },
      },
      select: {
        description: true,
        lineSubtotal: true,
        purchaseOrder: {
          select: {
            number: true,
            supplierContact: { select: { legalName: true, fantasyName: true } },
          },
        },
      },
      orderBy: [{ purchaseOrder: { number: "asc" } }, { sortOrder: "asc" }],
    });
    for (const line of poLines) {
      const name =
        line.purchaseOrder.supplierContact.fantasyName ??
        line.purchaseOrder.supplierContact.legalName;
      docs.push({
        documentType: "PO_LINE",
        documentCode: `OC-${line.purchaseOrder.number}`,
        supplierName: name,
        description: line.description || "Línea de OC sin partida EDT",
        amount: serializeMoneyDecimal(line.lineSubtotal),
      });
    }
  }

  if (apEnabled) {
    const invoices = await prisma.supplierInvoice.findMany({
      where: {
        projectId,
        tenantId: ctx.tenantId,
        status: "ISSUED",
        subcontractCertificationId: null,
      },
      select: {
        number: true,
        totalAmount: true,
        supplierContact: { select: { legalName: true, fantasyName: true } },
        lines: {
          select: {
            lineSubtotal: true,
            wbsNodeId: true,
            description: true,
            purchaseOrderLine: { select: { wbsNodeId: true } },
          },
        },
      },
      orderBy: { number: "asc" },
    });

    for (const inv of invoices) {
      const name = inv.supplierContact.fantasyName ?? inv.supplierContact.legalName;
      if (inv.lines.length === 0) {
        docs.push({
          documentType: "SUPPLIER_INVOICE",
          documentCode: `FP-${inv.number}`,
          supplierName: name,
          description: "Factura sin líneas / sin EDT",
          amount: serializeMoneyDecimal(inv.totalAmount),
        });
        continue;
      }
      for (const line of inv.lines) {
        const wbs = line.wbsNodeId ?? line.purchaseOrderLine?.wbsNodeId ?? null;
        if (wbs) continue;
        docs.push({
          documentType: "SUPPLIER_INVOICE",
          documentCode: `FP-${inv.number}`,
          supplierName: name,
          description: line.description || "Línea de factura sin partida EDT",
          amount: serializeMoneyDecimal(line.lineSubtotal),
        });
      }
    }
  }

  return docs;
}
