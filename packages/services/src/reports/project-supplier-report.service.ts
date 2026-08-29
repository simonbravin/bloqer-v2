import { Prisma, prisma } from "@bloqer/database";
import { canViewProcurementProjectArea } from "../procurement/procurement-access";
import { hasOpenObligationBalance, isObligationOverdue } from "../finance/obligation-date";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import type { TenantModuleSectionExcludedWarning } from "../tenant-modules/tenant-module-report-warnings";
import { ServiceContext, ServiceError } from "../types";
import { requireProjectInTenant } from "../project/require-project-in-tenant";
import { parseFilterDate } from "./report-month";
import {
  buildProjectSupplierReport,
  type ProjectSupplierReportBuilt,
} from "./project-supplier-report-pure";

export type {
  ProjectSupplierLeaderRow,
  ProjectSupplierReportRow,
  ProjectSupplierReportTotals,
} from "./project-supplier-report-pure";

export type ProjectSupplierReportFilters = {
  dateFrom?: string;
  dateTo?: string;
};

export type ProjectSupplierReport = ProjectSupplierReportBuilt & {
  projectId: string;
  warnings: string[];
  sectionsExcluded: TenantModuleSectionExcludedWarning[];
};

const PO_COMMITTED_STATUSES = ["CONFIRMED", "PARTIALLY_RECEIVED", "RECEIVED"] as const;
const OPEN_PAYABLE_STATUSES = ["OPEN", "PARTIAL", "OVERDUE"] as const;

function dateWhere(field: "issueDate" | "receiptDate", filters: ProjectSupplierReportFilters) {
  if (!filters.dateFrom && !filters.dateTo) return {};
  return {
    [field]: {
      ...(filters.dateFrom ? { gte: parseFilterDate(filters.dateFrom, false) } : {}),
      ...(filters.dateTo ? { lte: parseFilterDate(filters.dateTo, true) } : {}),
    },
  };
}

function supplierLabel(c: { legalName: string; fantasyName: string | null }) {
  return c.fantasyName ?? c.legalName;
}

export async function getProjectSupplierReport(
  projectId: string,
  filters: ProjectSupplierReportFilters,
  ctx: ServiceContext,
): Promise<ProjectSupplierReport> {
  if (!canViewProcurementProjectArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver el reporte de proveedores");
  }

  await requireProjectInTenant(projectId, ctx.tenantId);

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
    warnings.push("Compras deshabilitadas: pedidos y comprometido en cero.");
  }
  if (!apEnabled) {
    sectionsExcluded.push({
      module: "AP",
      section: "Facturas proveedor",
      reason: "TENANT_MODULE_DISABLED",
    });
    warnings.push("AP deshabilitado: devengado, pagado y saldo CxP en cero.");
  }

  const [purchaseOrders, invoices, receipts, payables] = await Promise.all([
    procEnabled
      ? prisma.purchaseOrder.findMany({
          where: {
            projectId,
            tenantId: ctx.tenantId,
            status: { in: [...PO_COMMITTED_STATUSES] },
            ...dateWhere("issueDate", filters),
          },
          select: {
            id: true,
            status: true,
            issueDate: true,
            supplierContact: { select: { id: true, legalName: true, fantasyName: true } },
            lines: { select: { lineSubtotal: true } },
          },
        })
      : Promise.resolve([]),
    apEnabled
      ? prisma.supplierInvoice.findMany({
          where: {
            projectId,
            tenantId: ctx.tenantId,
            status: "ISSUED",
            subcontractCertificationId: null,
            ...dateWhere("issueDate", filters),
          },
          select: {
            id: true,
            issueDate: true,
            totalAmount: true,
            purchaseOrderId: true,
            supplierContact: { select: { id: true, legalName: true, fantasyName: true } },
            lines: { select: { lineSubtotal: true } },
            payable: {
              select: {
                payments: { where: { status: "CONFIRMED" }, select: { amount: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
    procEnabled
      ? prisma.purchaseReceipt.findMany({
          where: {
            projectId,
            tenantId: ctx.tenantId,
            status: "CONFIRMED",
            ...dateWhere("receiptDate", filters),
          },
          select: {
            supplierContact: { select: { id: true, legalName: true, fantasyName: true } },
            receiptDate: true,
          },
        })
      : Promise.resolve([]),
    // Snapshot of open AP today — not period-sliced (same idea as aging R-008).
    apEnabled
      ? prisma.payable.findMany({
          where: {
            projectId,
            tenantId: ctx.tenantId,
            status: { in: [...OPEN_PAYABLE_STATUSES] },
            supplierInvoice: { subcontractCertificationId: null },
          },
          select: {
            originalAmount: true,
            paidAmount: true,
            dueDate: true,
            supplierContact: { select: { id: true, legalName: true, fantasyName: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const built = buildProjectSupplierReport({
    purchaseOrders: purchaseOrders.map((po) => ({
      id: po.id,
      supplierContactId: po.supplierContact.id,
      supplierName: supplierLabel(po.supplierContact),
      status: po.status,
      issueDate: po.issueDate,
      lineSubtotal: po.lines.reduce((s, l) => s.add(l.lineSubtotal), new Prisma.Decimal(0)),
    })),
    invoices: invoices.map((inv) => {
      const net =
        inv.lines.length > 0
          ? inv.lines.reduce((s, l) => s.add(l.lineSubtotal), new Prisma.Decimal(0))
          : inv.totalAmount;
      const paid = inv.payable?.payments.reduce((s, p) => s.add(p.amount), new Prisma.Decimal(0)) ??
        new Prisma.Decimal(0);
      return {
        id: inv.id,
        supplierContactId: inv.supplierContact.id,
        supplierName: supplierLabel(inv.supplierContact),
        issueDate: inv.issueDate,
        netAmount: net,
        paidAmount: paid,
        purchaseOrderId: inv.purchaseOrderId,
      };
    }),
    receipts: receipts.map((r) => ({
      supplierContactId: r.supplierContact.id,
      supplierName: supplierLabel(r.supplierContact),
      receiptDate: r.receiptDate,
    })),
    payables: payables.map((p) => {
      const raw = p.originalAmount.minus(p.paidAmount);
      const balance = hasOpenObligationBalance(raw) ? raw : new Prisma.Decimal(0);
      const overdue = isObligationOverdue(p.dueDate) && hasOpenObligationBalance(balance);
      return {
        supplierContactId: p.supplierContact.id,
        supplierName: supplierLabel(p.supplierContact),
        balanceDue: balance,
        overdueAmount: overdue ? balance : new Prisma.Decimal(0),
      };
    }),
  });

  return {
    projectId,
    warnings,
    sectionsExcluded,
    ...built,
  };
}
