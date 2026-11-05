import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { canViewProcurementProjectArea } from "../procurement/procurement-access";
import { assertBudgetCostGraph } from "../budget/budget-cost-graph";
import { assertBudgetCurrency } from "../cost-control/comparison-currency";
import { assertTenantModuleEnabledWithGate, getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import type { TenantModuleSectionExcludedWarning } from "../tenant-modules/tenant-module-report-warnings";
import { ServiceContext, ServiceError } from "../types";
import { projectIdWhereForScope, requireProjectAccess, resolveAccessibleProjectScope } from "../security/access";
import { validateResourceVarianceDates } from "../resources/resource-variance-filters";
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
  currency: string;
  apAvailable: boolean;
  byWbs: ProcurementWbsDeviationRow[];
  unallocated: ProcurementUnallocatedRow[];
  bySupplier: ProcurementSupplierRow[];
  warnings: string[];
  sectionsExcluded: TenantModuleSectionExcludedWarning[];
};

export type ProcurementReportEmpty = { type: "NO_APPROVED_BUDGETS" };

export type ProcurementReportResult = ProcurementDeviationReport | ProcurementReportEmpty;

const PO_COMMITTED_STATUSES = ["CONFIRMED", "PARTIALLY_RECEIVED", "RECEIVED"] as const;

function purchaseDateRange(filters: MultiProjectProcurementFilters = {}) {
  if (!filters.dateFrom && !filters.dateTo) return undefined;
  return {
    ...(filters.dateFrom ? { gte: parseFilterDate(filters.dateFrom, false) } : {}),
    ...(filters.dateTo ? { lte: parseFilterDate(filters.dateTo, true) } : {}),
  };
}

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
  if (!canViewProcurementProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver reportes de compras");
  }
  validateResourceVarianceDates(filters);

  const project = await requireProjectAccess(projectId, ctx);
  const companyId = project.companyId ?? ctx.companyId;
  const scope = { tenantId: ctx.tenantId, projectId, ...(companyId ? { companyId } : {}) };
  const issueDate = purchaseDateRange(filters);
  const gate = await getTenantModuleGate(ctx);
  assertTenantModuleEnabledWithGate(gate, "PROCUREMENT");

  const budget = await resolveApprovedBudgetForProject(projectId, filters.budgetId, ctx);
  if (!budget) return { type: "NO_APPROVED_BUDGETS" };
  await assertBudgetCostGraph(budget.id);

  const warnings: string[] = [];
  const sectionsExcluded: TenantModuleSectionExcludedWarning[] = [];

  const apAvailable = gate.isEnabled("AP") && can(ctx.roles, "VIEW", "AP");

  if (!gate.isEnabled("AP")) {
    sectionsExcluded.push({
      module: "AP",
      section: "Facturas proveedor",
      reason: "TENANT_MODULE_DISABLED",
    });
  }
  if (!apAvailable) warnings.push("Facturas y pagos de proveedores no disponibles para este reporte.");

  const wbsLeaves = sortByWbsCode(
    await prisma.wbsNode.findMany({
      where: { budgetId: budget.id, type: "ITEM" },
      select: { id: true, code: true, name: true },
    }),
  );

  const costItems = await prisma.costItem.findMany({
    where: {
      budgetId: budget.id,
      wbsNode: { budgetId: budget.id, type: "ITEM" },
    },
    select: {
      wbsNodeId: true,
      quantity: true,
      analysisLines: {
        where: { budgetId: budget.id, category: "MATERIAL" },
        select: { totalCost: true },
      },
    },
  });

  const budgetMatMap = budgetMaterialForItems(costItems);
  const committedByWbs = new Map<string, Prisma.Decimal>();
  const accruedByWbs = new Map<string, Prisma.Decimal>();

  const supplierCommitted = new Map<string, Prisma.Decimal>();
  const supplierAccrued = new Map<string, Prisma.Decimal>();
  const commitmentByOrder = new Map<string, { supplierId: string; amount: Prisma.Decimal }>();
  const accrualByOrder = new Map<string, Prisma.Decimal>();
  const supplierPaid = new Map<string, Prisma.Decimal>();
  const supplierNames = new Map<string, string>();

  const unallocated: ProcurementUnallocatedRow[] = [];

  const poLines = await prisma.purchaseOrderLine.findMany({
    where: {
      purchaseOrder: {
        ...scope,
        status: { in: [...PO_COMMITTED_STATUSES] },
        issueDate,
      },
    },
    select: {
      purchaseOrderId: true,
      wbsNodeId: true,
      // D-095 / D-098: committed = lineSubtotal (neto), same basis as EDT cost-control.
      lineSubtotal: true,
      description: true,
      purchaseOrder: {
        select: {
          number: true,
          currency: true,
          supplierContact: { select: { id: true, tenantId: true, legalName: true, fantasyName: true } },
        },
      },
    },
  });

  for (const line of poLines) {
    if (line.purchaseOrder.supplierContact.tenantId !== ctx.tenantId) continue;
    assertBudgetCurrency(budget.currency, line.purchaseOrder.currency);
    const supId = line.purchaseOrder.supplierContact.id;
    const supName = line.purchaseOrder.supplierContact.fantasyName ?? line.purchaseOrder.supplierContact.legalName;
    supplierNames.set(supId, supName);
    supplierCommitted.set(supId, (supplierCommitted.get(supId) ?? new Prisma.Decimal(0)).add(line.lineSubtotal));
    const orderCommitment = commitmentByOrder.get(line.purchaseOrderId);
    commitmentByOrder.set(line.purchaseOrderId, {
      supplierId: supId,
      amount: (orderCommitment?.amount ?? new Prisma.Decimal(0)).add(line.lineSubtotal),
    });

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
    committedByWbs.set(line.wbsNodeId, (committedByWbs.get(line.wbsNodeId) ?? new Prisma.Decimal(0)).add(line.lineSubtotal));
  }

  if (apAvailable) {
    const invoices = await prisma.supplierInvoice.findMany({
      where: {
        ...scope,
        issueDate,
        status: "ISSUED",
        subcontractCertificationId: null,
      },
      select: {
        id: true,
        number: true,
        companyId: true,
        subtotal: true,
        currency: true,
        documentKind: true,
        purchaseOrderId: true,
        referencedSupplierInvoice: {
          select: { tenantId: true, projectId: true, companyId: true, supplierContactId: true, purchaseOrderId: true },
        },
        supplierContact: { select: { id: true, tenantId: true, legalName: true, fantasyName: true } },
        lines: {
          select: {
            lineSubtotal: true,
            wbsNodeId: true,
            purchaseOrderLineId: true,
            purchaseOrderLine: { select: { purchaseOrderId: true, wbsNodeId: true } },
          },
        },
        purchaseOrder: {
          select: {
            tenantId: true, projectId: true, companyId: true, supplierContactId: true,
            lines: { select: { wbsNodeId: true, lineSubtotal: true } },
          },
        },
        payable: {
          select: {
            tenantId: true, projectId: true, companyId: true,
            payments: {
              where: { ...scope, status: "CONFIRMED" },
              select: { amount: true, currency: true, companyId: true, supplierInvoiceId: true },
            },
          },
        },
      },
    });

    for (const inv of invoices) {
      if (inv.supplierContact.tenantId !== ctx.tenantId) continue;
      assertBudgetCurrency(budget.currency, inv.currency);
      const supId = inv.supplierContact.id;
      const supName = inv.supplierContact.fantasyName ?? inv.supplierContact.legalName;
      supplierNames.set(supId, supName);
      const sign = inv.documentKind === "CREDIT_NOTE" ? -1 : 1;
      const invNet = inv.subtotal.mul(sign);
      supplierAccrued.set(
        supId,
        (supplierAccrued.get(supId) ?? new Prisma.Decimal(0)).add(invNet),
      );

      const payable = inv.payable;
      const payments = payable?.tenantId === ctx.tenantId && payable.projectId === projectId &&
        payable.companyId === inv.companyId ? payable.payments : [];
      const paidOnInvoice = payments.reduce((sum, payment) => {
        if (payment.companyId !== inv.companyId || payment.supplierInvoiceId !== inv.id) return sum;
        assertBudgetCurrency(budget.currency, payment.currency);
        return sum.plus(payment.amount);
      }, new Prisma.Decimal(0));
      supplierPaid.set(supId, (supplierPaid.get(supId) ?? new Prisma.Decimal(0)).add(paidOnInvoice));

      const order = inv.purchaseOrder;
      const validOrder = order?.tenantId === ctx.tenantId && order.projectId === projectId &&
        order.companyId === inv.companyId && order.supplierContactId === supId;
      const origin = inv.referencedSupplierInvoice;
      const validOrigin = origin?.tenantId === ctx.tenantId && origin.projectId === projectId &&
        origin.companyId === inv.companyId && origin.supplierContactId === supId;
      const linkedOrderId = validOrder ? inv.purchaseOrderId : validOrigin ? origin.purchaseOrderId : null;
      if (linkedOrderId && commitmentByOrder.get(linkedOrderId)?.supplierId === supId) {
        accrualByOrder.set(linkedOrderId, (accrualByOrder.get(linkedOrderId) ?? new Prisma.Decimal(0)).add(invNet));
      }
      if (!validOrder) {
        for (const line of inv.lines) {
          if (line.wbsNodeId) accruedByWbs.set(
            line.wbsNodeId,
            (accruedByWbs.get(line.wbsNodeId) ?? new Prisma.Decimal(0)).add(line.lineSubtotal.mul(sign)),
          );
        }
        const unallocatedNet = inv.lines.length === 0
          ? invNet
          : inv.lines.filter((line) => !line.wbsNodeId)
            .reduce((sum, line) => sum.add(line.lineSubtotal.mul(sign)), new Prisma.Decimal(0));
        if (unallocatedNet.isZero()) continue;
        unallocated.push({
          documentType: "SUPPLIER_INVOICE",
          documentCode: `FP-${inv.number}`,
          supplierName: supName,
          description: "Comprobante sin imputación EDT",
          amount: unallocatedNet.toFixed(2),
        });
        continue;
      }

      const linkedLines = inv.lines.filter((l) => l.purchaseOrderLineId);
      if (linkedLines.length > 0) {
        for (const line of linkedLines) {
          const wbsId = line.purchaseOrderLine?.purchaseOrderId === inv.purchaseOrderId
            ? line.purchaseOrderLine.wbsNodeId ?? line.wbsNodeId
            : line.wbsNodeId;
          if (!wbsId) continue;
          accruedByWbs.set(
            wbsId,
            (accruedByWbs.get(wbsId) ?? new Prisma.Decimal(0)).add(line.lineSubtotal.mul(sign)),
          );
        }
        for (const line of inv.lines.filter((l) => !l.purchaseOrderLineId)) {
          if (!line.wbsNodeId) continue;
          accruedByWbs.set(
            line.wbsNodeId,
            (accruedByWbs.get(line.wbsNodeId) ?? new Prisma.Decimal(0)).add(line.lineSubtotal.mul(sign)),
          );
        }
        continue;
      }

      const poLines = order.lines;
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

  const openBySupplier = new Map<string, Prisma.Decimal>();
  for (const [orderId, { supplierId, amount }] of commitmentByOrder) {
    const open = Prisma.Decimal.max(0, amount.minus(accrualByOrder.get(orderId) ?? 0));
    openBySupplier.set(supplierId, (openBySupplier.get(supplierId) ?? new Prisma.Decimal(0)).add(open));
  }

  const bySupplier: ProcurementSupplierRow[] = [...supplierNames.entries()]
    .map(([supplierContactId, supplierName]) => {
      const committed = supplierCommitted.get(supplierContactId) ?? new Prisma.Decimal(0);
      const accrued = supplierAccrued.get(supplierContactId) ?? new Prisma.Decimal(0);
      const paid = supplierPaid.get(supplierContactId) ?? new Prisma.Decimal(0);
      const open = openBySupplier.get(supplierContactId) ?? new Prisma.Decimal(0);
      return {
        supplierContactId,
        supplierName,
        committedCost: committed.toFixed(2),
        accruedCost: accrued.toFixed(2),
        paidCost: paid.toFixed(2),
        openCommitted: open.toFixed(2),
      };
    })
    .sort((a, b) => a.supplierName.localeCompare(b.supplierName, "es"));

  return {
    type: "REPORT",
    projectId,
    budgetId: budget.id,
    budgetName: budget.name,
    currency: budget.currency,
    apAvailable,
    byWbs,
    unallocated,
    bySupplier,
    warnings,
    sectionsExcluded,
  };
}

export async function listProcurementReportBudgets(projectId: string, ctx: ServiceContext) {
  if (!canViewProcurementProjectArea(ctx.roles)) {
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
  currency: string;
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
  currency: string;
  status: string;
  totalAmount: string;
};

export type MultiProjectProcurementReport = {
  topSuppliers: MultiProjectSupplierRow[];
  openPurchaseOrders: MultiProjectOpenPoRow[];
  warnings: string[];
  apAvailable: boolean;
};

export async function getMultiProjectProcurementReport(
  ctx: ServiceContext,
  filters?: MultiProjectProcurementFilters,
): Promise<MultiProjectProcurementReport> {
  if (!canViewProcurementProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver compras multi-obra");
  }
  validateResourceVarianceDates(filters ?? {});

  const gate = await getTenantModuleGate(ctx);
  assertTenantModuleEnabledWithGate(gate, "PROCUREMENT");

  const warnings: string[] = [];
  const projectWhere = projectIdWhereForScope(await resolveAccessibleProjectScope(ctx));
  const scope = { tenantId: ctx.tenantId, ...(ctx.companyId ? { companyId: ctx.companyId } : {}), ...projectWhere };
  const issueDate = purchaseDateRange(filters);
  const apAvailable = gate.isEnabled("AP") && can(ctx.roles, "VIEW", "AP");
  if (!apAvailable) warnings.push("Facturas y pagos de proveedores no disponibles para este reporte.");

  const poLines = await prisma.purchaseOrderLine.findMany({
    where: {
      purchaseOrder: {
        ...scope,
        status: { in: ["CONFIRMED", "PARTIALLY_RECEIVED", "RECEIVED"] },
        issueDate,
        supplierContact: { tenantId: ctx.tenantId },
      },
    },
    select: {
      lineSubtotal: true,
      purchaseOrder: {
        select: {
          currency: true, companyId: true,
          project: { select: { companyId: true, tenantId: true } },
          supplierContact: { select: { id: true, legalName: true, fantasyName: true } },
        },
      },
    },
  });

  const suppliers = new Map<string, { supplierContactId: string; supplierName: string; currency: string; committed: Prisma.Decimal; accrued: Prisma.Decimal; paid: Prisma.Decimal }>();
  function supplierFor(contact: { id: string; legalName: string; fantasyName: string | null }, currency: string) {
    const key = `${contact.id}:${currency}`;
    const existing = suppliers.get(key);
    if (existing) return existing;
    const row = {
      supplierContactId: contact.id, supplierName: contact.fantasyName ?? contact.legalName, currency,
      committed: new Prisma.Decimal(0), accrued: new Prisma.Decimal(0), paid: new Prisma.Decimal(0),
    };
    suppliers.set(key, row);
    return row;
  }

  for (const line of poLines) {
    const order = line.purchaseOrder;
    if (order.project.tenantId !== ctx.tenantId ||
      (order.project.companyId !== null && order.project.companyId !== order.companyId)) continue;
    const supplier = supplierFor(order.supplierContact, order.currency);
    supplier.committed = supplier.committed.add(line.lineSubtotal);
  }

  const invoices = apAvailable ? await prisma.supplierInvoice.findMany({
    where: {
      ...scope,
      status: "ISSUED",
      purchaseOrderId: { not: null },
      subcontractCertificationId: null,
      issueDate,
      supplierContact: { tenantId: ctx.tenantId },
      purchaseOrder: { ...scope },
    },
    select: {
      id: true, companyId: true, projectId: true, currency: true, subtotal: true, documentKind: true,
      supplierContact: { select: { id: true, legalName: true, fantasyName: true } },
      purchaseOrder: { select: { projectId: true, companyId: true, project: { select: { tenantId: true, companyId: true } } } },
      payable: {
        select: {
          tenantId: true, projectId: true, companyId: true,
          payments: {
            where: { ...scope, status: "CONFIRMED" },
            select: { amount: true, currency: true, projectId: true, companyId: true, supplierInvoiceId: true },
          },
        },
      },
    },
  }) : [];

  for (const inv of invoices) {
    const order = inv.purchaseOrder;
    if (!order || order.projectId !== inv.projectId || order.companyId !== inv.companyId ||
      order.project.tenantId !== ctx.tenantId ||
      (order.project.companyId !== null && order.project.companyId !== inv.companyId)) continue;
    const supplier = supplierFor(inv.supplierContact, inv.currency);
    supplier.accrued = supplier.accrued.add(inv.subtotal.mul(inv.documentKind === "CREDIT_NOTE" ? -1 : 1));
    const payable = inv.payable;
    if (!payable || payable.tenantId !== ctx.tenantId || payable.projectId !== inv.projectId || payable.companyId !== inv.companyId) continue;
    for (const payment of payable.payments) {
      if (payment.supplierInvoiceId !== inv.id || payment.companyId !== inv.companyId || payment.projectId !== inv.projectId) continue;
      const paidSupplier = supplierFor(inv.supplierContact, payment.currency);
      paidSupplier.paid = paidSupplier.paid.add(payment.amount);
    }
  }

  const topSuppliers: MultiProjectSupplierRow[] = [...suppliers.values()]
    .sort((a, b) => a.currency.localeCompare(b.currency) || b.committed.comparedTo(a.committed) || a.supplierName.localeCompare(b.supplierName, "es"))
    .map(({ supplierContactId, supplierName, currency, committed, accrued, paid }) => ({
      supplierContactId, supplierName, currency,
      committedCost: committed.toFixed(2), accruedCost: accrued.toFixed(2), paidCost: paid.toFixed(2),
    }));

  const openPos = await prisma.purchaseOrder.findMany({
    where: {
      ...scope,
      status: { in: ["CONFIRMED", "PARTIALLY_RECEIVED"] },
      issueDate,
      supplierContact: { tenantId: ctx.tenantId },
    },
    select: {
      number: true,
      status: true,
      currency: true,
      companyId: true,
      totalAmount: true,
      project: { select: { id: true, tenantId: true, companyId: true, code: true, name: true } },
      supplierContact: { select: { legalName: true, fantasyName: true } },
    },
    orderBy: [{ currency: "asc" }, { totalAmount: "desc" }, { id: "asc" }],
    take: 201,
  });
  if (openPos.length > 200) warnings.push("Se muestran hasta 200 órdenes abiertas ordenadas por moneda e importe.");

  const openPurchaseOrders: MultiProjectOpenPoRow[] = openPos.filter((po) =>
    po.project.tenantId === ctx.tenantId &&
    (po.project.companyId === null || po.project.companyId === po.companyId),
  ).slice(0, 200).map((po) => ({
    projectId: po.project?.id ?? "",
    projectCode: po.project?.code ?? "",
    projectName: po.project?.name ?? "Sin proyecto",
    poNumber: `OC-${po.number}`,
    supplierName: po.supplierContact.fantasyName ?? po.supplierContact.legalName,
    status: po.status,
    currency: po.currency,
    totalAmount: po.totalAmount.toFixed(2),
  }));

  return { topSuppliers, openPurchaseOrders, warnings, apAvailable };
}
