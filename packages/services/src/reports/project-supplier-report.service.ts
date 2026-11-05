import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { computeObligationBalanceDue } from "../finance/obligation-balance";
import { canViewProcurementProjectArea } from "../procurement/procurement-access";
import { hasOpenObligationBalance, isObligationOverdue } from "../finance/obligation-date";
import { assertTenantModuleEnabledWithGate, getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import type { TenantModuleSectionExcludedWarning } from "../tenant-modules/tenant-module-report-warnings";
import { ServiceContext, ServiceError } from "../types";
import { requireProjectAccess } from "../security/access";
import { validateResourceVarianceDates } from "../resources/resource-variance-filters";
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
  currency?: string;
};

export type ProjectSupplierReport = ProjectSupplierReportBuilt & {
  projectId: string;
  currency: string;
  availableCurrencies: string[];
  apAvailable: boolean;
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

  validateResourceVarianceDates(filters);
  if (filters.currency && !/^[A-Z]{3}$/.test(filters.currency)) {
    throw new ServiceError("VALIDATION", "Elegí una moneda válida para el reporte.");
  }
  const project = await requireProjectAccess(projectId, ctx);
  const companyId = project.companyId ?? ctx.companyId;
  const scope = { tenantId: ctx.tenantId, projectId, ...(companyId ? { companyId } : {}) };

  const gate = await getTenantModuleGate(ctx);
  assertTenantModuleEnabledWithGate(gate, "PROCUREMENT");
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
  if (!apAvailable) warnings.push("Facturas, pagos y saldos de proveedores no disponibles para este reporte.");

  const [purchaseOrders, invoices, receiptRows, payables] = await Promise.all([
    prisma.purchaseOrder.findMany({
          where: {
            ...scope,
            supplierContact: { tenantId: ctx.tenantId },
            status: { in: [...PO_COMMITTED_STATUSES] },
            ...dateWhere("issueDate", filters),
          },
          select: {
            id: true,
            currency: true,
            status: true,
            issueDate: true,
            supplierContact: { select: { id: true, legalName: true, fantasyName: true } },
            lines: { select: { lineSubtotal: true } },
          },
        }),
    apAvailable
      ? prisma.supplierInvoice.findMany({
          where: {
            ...scope,
            supplierContact: { tenantId: ctx.tenantId },
            status: "ISSUED",
            subcontractCertificationId: null,
            ...dateWhere("issueDate", filters),
          },
          select: {
            id: true,
            issueDate: true,
            companyId: true, currency: true, subtotal: true, documentKind: true,
            purchaseOrderId: true,
            referencedSupplierInvoice: { select: { tenantId: true, projectId: true, companyId: true, supplierContactId: true, purchaseOrderId: true } },
            supplierContact: { select: { id: true, legalName: true, fantasyName: true } },
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
        })
      : Promise.resolve([]),
    prisma.purchaseReceipt.findMany({
          where: {
            ...scope,
            supplierContact: { tenantId: ctx.tenantId },
            purchaseOrder: scope,
            status: "CONFIRMED",
            ...dateWhere("receiptDate", filters),
          },
          select: {
            companyId: true,
            purchaseOrder: { select: { currency: true, companyId: true, supplierContactId: true } },
            supplierContact: { select: { id: true, legalName: true, fantasyName: true } },
            receiptDate: true,
          },
        }),
    // Snapshot of open AP today — not period-sliced (same idea as aging R-008).
    apAvailable
      ? prisma.payable.findMany({
          where: {
            ...scope,
            supplierContact: { tenantId: ctx.tenantId },
            status: { in: [...OPEN_PAYABLE_STATUSES] },
            supplierInvoice: { ...scope, status: "ISSUED", subcontractCertificationId: null },
          },
          select: {
            originalAmount: true,
            paidAmount: true,
            creditedAmount: true,
            dueDate: true,
            currency: true, companyId: true,
            supplierInvoice: { select: { companyId: true, supplierContactId: true, currency: true } },
            supplierContact: { select: { id: true, legalName: true, fantasyName: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const receipts = receiptRows.filter((row) => row.purchaseOrder.companyId === row.companyId &&
    row.purchaseOrder.supplierContactId === row.supplierContact.id);
  const scopedPayables = payables.filter((row) => row.supplierInvoice.companyId === row.companyId &&
    row.supplierInvoice.supplierContactId === row.supplierContact.id && row.supplierInvoice.currency === row.currency);
  const availableCurrencies = [...new Set([
    ...purchaseOrders.map((row) => row.currency),
    ...invoices.map((row) => row.currency),
    ...receipts.map((row) => row.purchaseOrder.currency),
    ...scopedPayables.map((row) => row.currency),
  ])].sort();
  const currency = filters.currency || (availableCurrencies.includes("ARS") ? "ARS" : availableCurrencies[0] ?? "ARS");
  if (availableCurrencies.length > 1) warnings.push("Los importes y rankings corresponden solo a la moneda seleccionada.");
  if (filters.currency && !availableCurrencies.includes(filters.currency) && availableCurrencies.length > 0) {
    warnings.push("No hay documentos en la moneda seleccionada para el período.");
  }

  const built = buildProjectSupplierReport({
    purchaseOrders: purchaseOrders.filter((po) => po.currency === currency).map((po) => ({
      id: po.id,
      supplierContactId: po.supplierContact.id,
      supplierName: supplierLabel(po.supplierContact),
      status: po.status,
      issueDate: po.issueDate,
      lineSubtotal: po.lines.reduce((s, l) => s.add(l.lineSubtotal), new Prisma.Decimal(0)),
    })),
    invoices: invoices.filter((inv) => inv.currency === currency).map((inv) => {
      const payable = inv.payable;
      const payments = payable?.tenantId === ctx.tenantId && payable.projectId === projectId &&
        payable.companyId === inv.companyId ? payable.payments : [];
      const paid = payments.filter((payment) => payment.companyId === inv.companyId &&
        payment.currency === currency && payment.supplierInvoiceId === inv.id)
        .reduce((sum, payment) => sum.add(payment.amount), new Prisma.Decimal(0));
      const origin = inv.referencedSupplierInvoice;
      const validOrigin = origin?.tenantId === ctx.tenantId && origin.projectId === projectId &&
        origin.companyId === inv.companyId && origin.supplierContactId === inv.supplierContact.id;
      return {
        id: inv.id,
        supplierContactId: inv.supplierContact.id,
        supplierName: supplierLabel(inv.supplierContact),
        issueDate: inv.issueDate,
        netAmount: inv.subtotal.mul(inv.documentKind === "CREDIT_NOTE" ? -1 : 1),
        paidAmount: paid,
        purchaseOrderId: inv.purchaseOrderId ?? (validOrigin ? origin.purchaseOrderId : null),
        countsAsInvoice: inv.documentKind === "INVOICE",
      };
    }),
    receipts: receipts.filter((r) => r.purchaseOrder.currency === currency).map((r) => ({
      supplierContactId: r.supplierContact.id,
      supplierName: supplierLabel(r.supplierContact),
      receiptDate: r.receiptDate,
    })),
    payables: scopedPayables.filter((p) => p.currency === currency).map((p) => {
      const raw = computeObligationBalanceDue(p.originalAmount, p.paidAmount, p.creditedAmount);
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
    currency,
    availableCurrencies,
    apAvailable,
    warnings,
    sectionsExcluded,
    ...built,
  };
}
