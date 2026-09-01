import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { canViewProcurementProjectArea } from "../procurement/procurement-access";
import { canViewProjectCostControlReport } from "../project/project-nav-guards";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import type { TenantModuleSectionExcludedWarning } from "../tenant-modules/tenant-module-report-warnings";
import { ServiceContext, ServiceError } from "../types";
import { requireProjectInTenant } from "../project/require-project-in-tenant";
import { listApprovedBudgetsForProject, resolveApprovedBudgetForProject } from "./report-budget-resolve";
import { parseFilterDate } from "./report-month";
import { sortByWbsCode } from "../budget/wbs-code-rules";

export type ProcurementReportFilters = {
  budgetId?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type ProcurementWbsDeviationRow = {
  wbsNodeId: string;
  wbsCode: string;
  wbsName: string;
  budgetMaterial: string;
  committedCost: string;
  accruedCost: string;
  varianceAmount: string;
  variancePct: string | null;
};

export type ProcurementUnallocatedRow = {
  documentType: "PO_LINE" | "SUPPLIER_INVOICE";
  documentCode: string;
  supplierName: string;
  description: string;
  amount: string;
};

export type ProcurementSupplierRow = {
  supplierContactId: string;
  supplierName: string;
  committedCost: string;
  accruedCost: string;
  paidCost: string;
  openCommitted: string;
};

export type ProcurementDeviationReport = {
  type: "REPORT";
  projectId: string;
  budgetId: string;
  budgetName: string;
  byWbs: ProcurementWbsDeviationRow[];
  unallocated: ProcurementUnallocatedRow[];
  bySupplier: ProcurementSupplierRow[];
  warnings: string[];
  sectionsExcluded: TenantModuleSectionExcludedWarning[];
};

export type ProcurementReportEmpty = { type: "NO_APPROVED_BUDGETS" };

export type ProcurementReportResult = ProcurementDeviationReport | ProcurementReportEmpty;

const PO_COMMITTED_STATUSES = ["CONFIRMED", "PARTIALLY_RECEIVED", "RECEIVED"] as const;

function budgetMaterialForItems(
  costItems: Array<{
    wbsNodeId: string;
    quantity: Prisma.Decimal;
    analysisLines: Array<{ totalCost: Prisma.Decimal }>;
  }>,
): Map<string, Prisma.Decimal> {
  const map = new Map<string, Prisma.Decimal>();
  for (const item of costItems) {
    const unitMat = item.analysisLines.reduce((s, l) => s.plus(l.totalCost), new Prisma.Decimal(0));
    map.set(item.wbsNodeId, unitMat.times(item.quantity));
  }
  return map;
}

export async function getProcurementDeviationReport(
  projectId: string,
  filters: ProcurementReportFilters,
  ctx: ServiceContext,
): Promise<ProcurementReportResult> {
  if (!canViewProcurementProjectArea(ctx.roles) && !can(ctx.roles, "VIEW", "PROJECTS")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver reportes de compras");
  }

  await requireProjectInTenant(projectId, ctx.tenantId);

  const budget = await resolveApprovedBudgetForProject(projectId, filters.budgetId, ctx);
  if (!budget) return { type: "NO_APPROVED_BUDGETS" };

  const gate = await getTenantModuleGate(ctx);
  const warnings: string[] = [];
  const sectionsExcluded: TenantModuleSectionExcludedWarning[] = [];

  const procEnabled = gate.isEnabled("PROCUREMENT");
  const apEnabled = gate.isEnabled("AP");

  if (!procEnabled) {
    sectionsExcluded.push({
      module: "PROCUREMENT",
      section: "Ordenes de compra",
      reason: "TENANT_MODULE_DISABLED",
    });
    warnings.push("Compras deshabilitadas: comprometido en cero.");
  }
  if (!apEnabled) {
    sectionsExcluded.push({
      module: "AP",
      section: "Facturas proveedor",
      reason: "TENANT_MODULE_DISABLED",
    });
    warnings.push("AP deshabilitado: devengado y pagado en cero.");
  }

  const wbsLeaves = sortByWbsCode(
    await prisma.wbsNode.findMany({
      where: { budgetId: budget.id, type: "ITEM" },
      select: { id: true, code: true, name: true },
    }),
  );

  const costItems = await prisma.costItem.findMany({
    where: {
      budgetId: budget.id,
      wbsNode: { type: "ITEM" },
    },
    select: {
      wbsNodeId: true,
      quantity: true,
      analysisLines: {
        where: { category: "MATERIAL" },
        select: { totalCost: true },
      },
    },
  });

  const budgetMatMap = budgetMaterialForItems(costItems);
  const committedByWbs = new Map<string, Prisma.Decimal>();
  const accruedByWbs = new Map<string, Prisma.Decimal>();

  const supplierCommitted = new Map<string, Prisma.Decimal>();
  const supplierAccrued = new Map<string, Prisma.Decimal>();
  const supplierPaid = new Map<string, Prisma.Decimal>();
  const supplierNames = new Map<string, string>();

  const unallocated: ProcurementUnallocatedRow[] = [];

  if (procEnabled) {
    const poLines = await prisma.purchaseOrderLine.findMany({
      where: {
        purchaseOrder: {
          projectId,
          tenantId: ctx.tenantId,
          status: { in: [...PO_COMMITTED_STATUSES] },
        },
      },
      select: {
        wbsNodeId: true,
        // D-095 / D-098: committed = lineSubtotal (neto), same basis as EDT cost-control.
        lineSubtotal: true,
        description: true,
        purchaseOrder: {
          select: {
            number: true,
            supplierContact: { select: { id: true, legalName: true, fantasyName: true } },
          },
        },
      },
    });

    for (const line of poLines) {
      const supId = line.purchaseOrder.supplierContact.id;
      const supName =
        line.purchaseOrder.supplierContact.fantasyName ??
        line.purchaseOrder.supplierContact.legalName;
      supplierNames.set(supId, supName);
      supplierCommitted.set(
        supId,
        (supplierCommitted.get(supId) ?? new Prisma.Decimal(0)).add(line.lineSubtotal),
      );

      if (!line.wbsNodeId) {
        unallocated.push({
          documentType: "PO_LINE",
          documentCode: `OC-${line.purchaseOrder.number}`,
          supplierName: supName,
          description: line.description,
          amount: line.lineSubtotal.toFixed(2),
        });
        continue;
      }
      committedByWbs.set(
        line.wbsNodeId,
        (committedByWbs.get(line.wbsNodeId) ?? new Prisma.Decimal(0)).add(line.lineSubtotal),
      );
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
        id: true,
        number: true,
        totalAmount: true,
        purchaseOrderId: true,
        supplierContact: { select: { id: true, legalName: true, fantasyName: true } },
        lines: {
          select: {
            lineSubtotal: true,
            lineTotal: true,
            wbsNodeId: true,
            purchaseOrderLineId: true,
            purchaseOrderLine: { select: { wbsNodeId: true } },
          },
        },
        purchaseOrder: {
          select: {
            lines: { select: { wbsNodeId: true, lineSubtotal: true, lineTotal: true } },
          },
        },
        payable: {
          select: {
            paidAmount: true,
            payments: { where: { status: "CONFIRMED" }, select: { amount: true } },
          },
        },
      },
    });

    for (const inv of invoices) {
      const supId = inv.supplierContact.id;
      const supName = inv.supplierContact.fantasyName ?? inv.supplierContact.legalName;
      supplierNames.set(supId, supName);
      const invNet =
        inv.lines.length > 0
          ? inv.lines.reduce((s, l) => s.plus(l.lineSubtotal), new Prisma.Decimal(0))
          : inv.totalAmount;
      supplierAccrued.set(
        supId,
        (supplierAccrued.get(supId) ?? new Prisma.Decimal(0)).add(invNet),
      );

      const paidOnInvoice =
        inv.payable?.payments.reduce((s, p) => s.plus(p.amount), new Prisma.Decimal(0)) ??
        new Prisma.Decimal(0);
      supplierPaid.set(supId, (supplierPaid.get(supId) ?? new Prisma.Decimal(0)).add(paidOnInvoice));

      if (!inv.purchaseOrderId || !inv.purchaseOrder) {
        unallocated.push({
          documentType: "SUPPLIER_INVOICE",
          documentCode: `FP-${inv.number}`,
          supplierName: supName,
          description: "Factura sin OC",
          amount: inv.totalAmount.toFixed(2),
        });
        continue;
      }

      const linkedLines = inv.lines.filter((l) => l.purchaseOrderLineId);
      if (linkedLines.length > 0) {
        for (const line of linkedLines) {
          const wbsId = line.purchaseOrderLine?.wbsNodeId ?? line.wbsNodeId;
          if (!wbsId) continue;
          accruedByWbs.set(
            wbsId,
            (accruedByWbs.get(wbsId) ?? new Prisma.Decimal(0)).add(line.lineSubtotal),
          );
        }
        for (const line of inv.lines.filter((l) => !l.purchaseOrderLineId)) {
          if (!line.wbsNodeId) continue;
          accruedByWbs.set(
            line.wbsNodeId,
            (accruedByWbs.get(line.wbsNodeId) ?? new Prisma.Decimal(0)).add(line.lineSubtotal),
          );
        }
        continue;
      }

      const poLines = inv.purchaseOrder.lines;
      const poTotal = poLines.reduce((s, l) => s.plus(l.lineSubtotal), new Prisma.Decimal(0));
      if (poTotal.isZero()) continue;

      for (const pol of poLines) {
        if (!pol.wbsNodeId) continue;
        const share = invNet.mul(pol.lineSubtotal).div(poTotal);
        accruedByWbs.set(
          pol.wbsNodeId,
          (accruedByWbs.get(pol.wbsNodeId) ?? new Prisma.Decimal(0)).add(share),
        );
      }
    }
  }

  const byWbs: ProcurementWbsDeviationRow[] = wbsLeaves.map((w) => {
    const budgetMat = budgetMatMap.get(w.id) ?? new Prisma.Decimal(0);
    const committed = committedByWbs.get(w.id) ?? new Prisma.Decimal(0);
    const accrued = accruedByWbs.get(w.id) ?? new Prisma.Decimal(0);
    const variance = budgetMat.minus(committed);
    const pct = budgetMat.isZero() ? null : variance.div(budgetMat).times(100).toFixed(2);
    return {
      wbsNodeId: w.id,
      wbsCode: w.code,
      wbsName: w.name,
      budgetMaterial: budgetMat.toFixed(2),
      committedCost: committed.toFixed(2),
      accruedCost: accrued.toFixed(2),
      varianceAmount: variance.toFixed(2),
      variancePct: pct,
    };
  });

  const bySupplier: ProcurementSupplierRow[] = [...supplierNames.entries()]
    .map(([supplierContactId, supplierName]) => {
      const committed = supplierCommitted.get(supplierContactId) ?? new Prisma.Decimal(0);
      const accrued = supplierAccrued.get(supplierContactId) ?? new Prisma.Decimal(0);
      const paid = supplierPaid.get(supplierContactId) ?? new Prisma.Decimal(0);
      const open = committed.minus(accrued);
      return {
        supplierContactId,
        supplierName,
        committedCost: committed.toFixed(2),
        accruedCost: accrued.toFixed(2),
        paidCost: paid.toFixed(2),
        openCommitted: open.greaterThan(0) ? open.toFixed(2) : "0.00",
      };
    })
    .sort((a, b) => a.supplierName.localeCompare(b.supplierName, "es"));

  return {
    type: "REPORT",
    projectId,
    budgetId: budget.id,
    budgetName: budget.name,
    byWbs,
    unallocated,
    bySupplier,
    warnings,
    sectionsExcluded,
  };
}

export async function listProcurementReportBudgets(projectId: string, ctx: ServiceContext) {
  if (!canViewProjectCostControlReport(ctx.roles) && !canViewProcurementProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos");
  }
  return listApprovedBudgetsForProject(projectId, ctx);
}

// ─── Multi-project procurement ──────────────────────────────────────────────

export type MultiProjectProcurementFilters = {
  dateFrom?: string;
  dateTo?: string;
};

export type MultiProjectSupplierRow = {
  supplierContactId: string;
  supplierName: string;
  committedCost: string;
  accruedCost: string;
  paidCost: string;
};

export type MultiProjectOpenPoRow = {
  projectId: string;
  projectCode: string;
  projectName: string;
  poNumber: string;
  supplierName: string;
  status: string;
  totalAmount: string;
};

export type MultiProjectProcurementReport = {
  topSuppliers: MultiProjectSupplierRow[];
  openPurchaseOrders: MultiProjectOpenPoRow[];
  warnings: string[];
};

export async function getMultiProjectProcurementReport(
  ctx: ServiceContext,
  filters?: MultiProjectProcurementFilters,
): Promise<MultiProjectProcurementReport> {
  if (!canViewProcurementProjectArea(ctx.roles) && !can(ctx.roles, "VIEW", "PROJECTS")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver compras multi-obra");
  }

  const gate = await getTenantModuleGate(ctx);
  if (!gate.isEnabled("PROCUREMENT")) {
    throw new ServiceError("FORBIDDEN", "Módulo de compras deshabilitado");
  }

  const warnings: string[] = [];

  const dateFilter: Prisma.PurchaseOrderWhereInput = {};
  if (filters?.dateFrom || filters?.dateTo) {
    dateFilter.issueDate = {};
    if (filters.dateFrom) dateFilter.issueDate.gte = parseFilterDate(filters.dateFrom, false);
    if (filters.dateTo) dateFilter.issueDate.lte = parseFilterDate(filters.dateTo, true);
  }

  const poLines = await prisma.purchaseOrderLine.findMany({
    where: {
      purchaseOrder: {
        tenantId: ctx.tenantId,
        status: { in: ["CONFIRMED", "PARTIALLY_RECEIVED", "RECEIVED"] },
        ...dateFilter,
      },
    },
    select: {
      lineSubtotal: true,
      purchaseOrder: {
        select: {
          supplierContact: { select: { id: true, legalName: true, fantasyName: true } },
        },
      },
    },
  });

  const supplierCommitted = new Map<string, Prisma.Decimal>();
  const supplierNames = new Map<string, string>();

  for (const line of poLines) {
    const supId = line.purchaseOrder.supplierContact.id;
    const supName =
      line.purchaseOrder.supplierContact.fantasyName ??
      line.purchaseOrder.supplierContact.legalName;
    supplierNames.set(supId, supName);
    supplierCommitted.set(
      supId,
      (supplierCommitted.get(supId) ?? new Prisma.Decimal(0)).add(line.lineSubtotal),
    );
  }

  const invoices = await prisma.supplierInvoice.findMany({
    where: {
      tenantId: ctx.tenantId,
      status: "ISSUED",
      purchaseOrderId: { not: null },
      subcontractCertificationId: null,
      ...(filters?.dateFrom || filters?.dateTo
        ? {
            issueDate: {
              ...(filters.dateFrom ? { gte: parseFilterDate(filters.dateFrom, false) } : {}),
              ...(filters.dateTo ? { lte: parseFilterDate(filters.dateTo, true) } : {}),
            },
          }
        : {}),
    },
    select: {
      totalAmount: true,
      lines: { select: { lineSubtotal: true } },
      supplierContact: { select: { id: true, legalName: true, fantasyName: true } },
      payable: {
        select: {
          payments: { where: { status: "CONFIRMED" }, select: { amount: true } },
        },
      },
    },
  });

  const supplierAccrued = new Map<string, Prisma.Decimal>();
  const supplierPaid = new Map<string, Prisma.Decimal>();

  for (const inv of invoices) {
    const supId = inv.supplierContact.id;
    const supName = inv.supplierContact.fantasyName ?? inv.supplierContact.legalName;
    supplierNames.set(supId, supName);
    const invNet =
      inv.lines.length > 0
        ? inv.lines.reduce((s, l) => s.plus(l.lineSubtotal), new Prisma.Decimal(0))
        : inv.totalAmount;
    supplierAccrued.set(
      supId,
      (supplierAccrued.get(supId) ?? new Prisma.Decimal(0)).add(invNet),
    );
    const paid = inv.payable?.payments.reduce(
      (s, p) => s.plus(p.amount),
      new Prisma.Decimal(0),
    ) ?? new Prisma.Decimal(0);
    supplierPaid.set(supId, (supplierPaid.get(supId) ?? new Prisma.Decimal(0)).add(paid));
  }

  const topSuppliers: MultiProjectSupplierRow[] = [...supplierNames.entries()]
    .map(([supplierContactId, supplierName]) => ({
      supplierContactId,
      supplierName,
      committedCost: (supplierCommitted.get(supplierContactId) ?? new Prisma.Decimal(0)).toFixed(2),
      accruedCost: (supplierAccrued.get(supplierContactId) ?? new Prisma.Decimal(0)).toFixed(2),
      paidCost: (supplierPaid.get(supplierContactId) ?? new Prisma.Decimal(0)).toFixed(2),
    }))
    .sort((a, b) => Number(b.committedCost) - Number(a.committedCost));

  const openPos = await prisma.purchaseOrder.findMany({
    where: {
      tenantId: ctx.tenantId,
      status: { in: ["CONFIRMED", "PARTIALLY_RECEIVED"] },
      ...dateFilter,
    },
    select: {
      number: true,
      status: true,
      totalAmount: true,
      project: { select: { id: true, code: true, name: true } },
      supplierContact: { select: { legalName: true, fantasyName: true } },
    },
    orderBy: { totalAmount: "desc" },
    take: 200,
  });

  const openPurchaseOrders: MultiProjectOpenPoRow[] = openPos.map((po) => ({
    projectId: po.project?.id ?? "",
    projectCode: po.project?.code ?? "",
    projectName: po.project?.name ?? "Sin proyecto",
    poNumber: `OC-${po.number}`,
    supplierName: po.supplierContact.fantasyName ?? po.supplierContact.legalName,
    status: po.status,
    totalAmount: po.totalAmount.toFixed(2),
  }));

  return { topSuppliers, openPurchaseOrders, warnings };
}
