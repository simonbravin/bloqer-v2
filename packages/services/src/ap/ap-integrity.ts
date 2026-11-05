import { Prisma, prisma } from "@bloqer/database";
import { assertContactHasAnyMatchingRole, lockContactForMutation } from "../contact/assert-contact-role";
import { ServiceError } from "../types";
import type { ServiceContext } from "../types";
import { isCrossCompany } from "../company-scope";
import { OBLIGATION_OPEN_BALANCE_EPSILON } from "../finance/obligation-date";
import { createTenantModuleGate } from "../tenant-modules/tenant-module-gate";
import { assertTenantModuleEnabledWithGate } from "../tenant-modules/tenant-module.service";

export async function assertApTransactionModules(tx: Prisma.TransactionClient, ctx: ServiceContext, treasury = false): Promise<void> {
  const rows = await tx.tenantModuleSetting.findMany({ where: { tenantId: ctx.tenantId }, select: { moduleKey: true, isEnabled: true } });
  const gate = createTenantModuleGate(new Map(rows.map(row => [row.moduleKey, row.isEnabled])));
  assertTenantModuleEnabledWithGate(gate, "AP");
  if (treasury) assertTenantModuleEnabledWithGate(gate, "TREASURY");
}

const apRootParents = {
  company: { select: { id: true, tenantId: true } },
  supplierContact: { select: { id: true, tenantId: true, legalName: true, fantasyName: true } },
  project: { select: { id: true, tenantId: true, companyId: true, name: true } },
} as const;

export const apInvoiceParents = {
  ...apRootParents,
  referencedSupplierInvoice: { select: { id: true, tenantId: true, companyId: true, projectId: true, supplierContactId: true, currency: true, documentKind: true } },
  purchaseOrder: { select: { id: true, tenantId: true, companyId: true, projectId: true, supplierContactId: true, currency: true } },
  subcontractCertification: { select: { id: true, number: true, tenantId: true, companyId: true, projectId: true,
    subcontractorContactId: true, subcontractId: true, subcontract: { select: { tenantId: true, companyId: true, projectId: true, subcontractorContactId: true } } } },
} as const satisfies Prisma.SupplierInvoiceInclude;

export const apInvoiceLineParents = {
  wbsNode: { select: { id: true, budgetId: true, budget: { select: { tenantId: true, companyId: true, projectId: true } } } },
  purchaseOrderLine: { select: { id: true, purchaseOrderId: true, wbsNodeId: true,
    purchaseOrder: { select: { tenantId: true, companyId: true, projectId: true } } } },
  costAnalysisLine: { select: { id: true, budgetId: true, costItem: { select: { budgetId: true, wbsNodeId: true } } } },
} as const satisfies Prisma.SupplierInvoiceLineInclude;

export function assertApInvoiceLineParents(invoice: InvoiceScope & { id: string; purchaseOrderId?: string | null }, lines: Array<{
  invoiceId: string; wbsNodeId: string | null; purchaseOrderLineId: string | null; costAnalysisLineId: string | null;
  wbsNode: { id: string; budgetId: string; budget: { tenantId: string; companyId: string | null; projectId: string } } | null;
  purchaseOrderLine: { id: string; purchaseOrderId: string; wbsNodeId: string | null; purchaseOrder: { tenantId: string; companyId: string; projectId: string } } | null;
  costAnalysisLine: { id: string; budgetId: string; costItem: { budgetId: string; wbsNodeId: string } } | null;
}>): void {
  for (const line of lines) {
    const wbs = line.wbsNode, po = line.purchaseOrderLine, apu = line.costAnalysisLine;
    if (line.invoiceId !== invoice.id || (invoice.projectId === null ? Boolean(line.wbsNodeId || line.purchaseOrderLineId || line.costAnalysisLineId) :
        !wbs || wbs.id !== line.wbsNodeId || wbs.budget.tenantId !== invoice.tenantId || wbs.budget.projectId !== invoice.projectId ||
        (wbs.budget.companyId !== null && wbs.budget.companyId !== invoice.companyId)) ||
        (line.purchaseOrderLineId && (!po || po.id !== line.purchaseOrderLineId || po.purchaseOrderId !== invoice.purchaseOrderId ||
          po.purchaseOrder.tenantId !== invoice.tenantId || po.purchaseOrder.companyId !== invoice.companyId || po.purchaseOrder.projectId !== invoice.projectId ||
          (po.wbsNodeId !== null && po.wbsNodeId !== line.wbsNodeId))) ||
        (line.costAnalysisLineId && (!apu || apu.id !== line.costAnalysisLineId || !wbs || apu.budgetId !== wbs.budgetId ||
          apu.costItem.budgetId !== wbs.budgetId || apu.costItem.wbsNodeId !== wbs.id))) {
      throw new ServiceError("CONFLICT", "Las líneas de la factura tienen relaciones de EDT, APU u orden de compra inconsistentes");
    }
  }
}

export const apPayableParents = {
  ...apRootParents,
  supplierInvoice: { include: apInvoiceParents },
} as const satisfies Prisma.PayableInclude;

export const apPaymentParents = {
  ...apRootParents,
  account: true,
  payable: { include: apPayableParents },
  supplierInvoice: { include: apInvoiceParents },
} as const satisfies Prisma.PaymentInclude;

type JoinedRoot = InvoiceScope & {
  company: { id: string; tenantId: string };
  supplierContact: { id: string; tenantId: string };
  project: { id: string; tenantId: string; companyId: string | null } | null;
  currency?: string; documentKind?: string;
  purchaseOrderId?: string | null;
  purchaseOrder?: { id: string; tenantId: string; companyId: string; projectId: string; supplierContactId: string; currency: string } | null;
  referencedSupplierInvoiceId?: string | null;
  referencedSupplierInvoice?: { id: string; tenantId: string; companyId: string; projectId: string | null; supplierContactId: string; currency: string; documentKind: string } | null;
  subcontractCertificationId?: string | null;
  subcontractCertification?: { id: string; tenantId: string; companyId: string; projectId: string; subcontractorContactId: string;
    subcontract: { tenantId: string; companyId: string; projectId: string; subcontractorContactId: string } } | null;
};

export function assertApReadRoot(row: JoinedRoot, ctx: ServiceContext): void {
  if (row.tenantId !== ctx.tenantId || isCrossCompany(row.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "El comprobante no pertenece al contexto autorizado");
  }
  if (row.company.id !== row.companyId || row.company.tenantId !== row.tenantId ||
      row.supplierContact.id !== row.supplierContactId || row.supplierContact.tenantId !== row.tenantId ||
      (row.projectId === null ? row.project !== null : !row.project || row.project.id !== row.projectId ||
        row.project.tenantId !== row.tenantId || (row.project.companyId !== null && row.project.companyId !== row.companyId))) {
    throw new ServiceError("CONFLICT", "El comprobante tiene relaciones de empresa, obra o contacto inconsistentes");
  }
  const parent = row.referencedSupplierInvoice;
  const isNote = row.documentKind === "CREDIT_NOTE" || row.documentKind === "DEBIT_NOTE";
  if (isNote && !row.referencedSupplierInvoiceId) throw new ServiceError("CONFLICT", "La nota requiere una factura de referencia");
  if (row.referencedSupplierInvoiceId && (!isNote || !parent || parent.id !== row.referencedSupplierInvoiceId || parent.documentKind !== "INVOICE" ||
      parent.tenantId !== row.tenantId || parent.companyId !== row.companyId || parent.projectId !== row.projectId ||
      parent.supplierContactId !== row.supplierContactId || parent.currency !== row.currency)) {
    throw new ServiceError("CONFLICT", "La nota y su factura de referencia tienen relaciones inconsistentes");
  }
  const order = row.purchaseOrder;
  if (row.purchaseOrderId && (!order || order.id !== row.purchaseOrderId || order.tenantId !== row.tenantId ||
      order.companyId !== row.companyId || order.projectId !== row.projectId || order.supplierContactId !== row.supplierContactId || order.currency !== row.currency)) {
    throw new ServiceError("CONFLICT", "La factura y su orden de compra tienen relaciones inconsistentes");
  }
  const certification = row.subcontractCertification;
  if (row.subcontractCertificationId && (!certification || row.documentKind !== "INVOICE" || certification.id !== row.subcontractCertificationId ||
      certification.tenantId !== row.tenantId || certification.companyId !== row.companyId || certification.projectId !== row.projectId ||
      certification.subcontractorContactId !== row.supplierContactId || certification.subcontract.tenantId !== row.tenantId ||
      certification.subcontract.companyId !== row.companyId || certification.subcontract.projectId !== row.projectId ||
      certification.subcontract.subcontractorContactId !== row.supplierContactId)) {
    throw new ServiceError("CONFLICT", "La factura y su certificado de subcontrato tienen relaciones inconsistentes");
  }
}

export function assertApPayableReadParents(row: JoinedRoot & PayableScope & { supplierInvoice: JoinedRoot & InvoiceFinancialScope }, ctx: ServiceContext): void {
  assertApReadRoot(row, ctx);
  assertApReadRoot(row.supplierInvoice, ctx);
  assertApPayableMatchesInvoice(row, row.supplierInvoice, false);
}

export function assertApPaymentReadParents(row: JoinedRoot & {
  payableId: string; supplierInvoiceId: string; accountId: string; currency: string;
  payable: JoinedRoot & PayableScope & { id: string; supplierInvoice: JoinedRoot & InvoiceFinancialScope };
  supplierInvoice: JoinedRoot & InvoiceFinancialScope;
  account: { id: string; tenantId: string; companyId: string | null; currency: string };
}, ctx: ServiceContext): void {
  assertApReadRoot(row, ctx);
  assertApPayableReadParents(row.payable, ctx);
  assertApReadRoot(row.supplierInvoice, ctx);
  if (row.payable.id !== row.payableId || row.payable.supplierInvoiceId !== row.supplierInvoiceId ||
      row.supplierInvoice.id !== row.supplierInvoiceId || row.payable.companyId !== row.companyId ||
      row.payable.projectId !== row.projectId || row.payable.supplierContactId !== row.supplierContactId || row.payable.currency !== row.currency ||
      row.account.id !== row.accountId || row.account.tenantId !== row.tenantId || row.account.currency !== row.currency ||
      (row.account.companyId !== null && row.account.companyId !== row.companyId)) {
    throw new ServiceError("CONFLICT", "El pago y sus documentos o cuenta tienen relaciones inconsistentes");
  }
}

export function stripApParents<T extends object>(row: T): T {
  const copy = { ...row } as Record<string, unknown>;
  for (const key of ["company", "project", "supplierContact", "supplierInvoice", "payable", "account", "purchaseOrder", "creditApplicationAsNote", "subcontractCertification", "referencedSupplierInvoice"]) delete copy[key];
  return copy as T;
}

export async function assertApPayeeInTransaction(
  tx: Prisma.TransactionClient, contactId: string, tenantId: string, linkedToPurchaseOrder: boolean,
): Promise<void> {
  await lockContactForMutation(tx, contactId, tenantId);
  const [contact, matchingRole] = await Promise.all([
    tx.contact.findUnique({ where: { id: contactId }, select: { tenantId: true, status: true } }),
    tx.contactRole.findFirst({ where: { contactId, tenantId,
      role: { in: linkedToPurchaseOrder ? ["SUPPLIER"] : ["SUPPLIER", "EMPLOYEE"] }, status: "ACTIVE" },
      select: { tenantId: true, status: true } }),
  ]);
  assertContactHasAnyMatchingRole({ contact, matchingRole, ctxTenantId: tenantId,
    allowedRoleTypes: linkedToPurchaseOrder ? ["SUPPLIER"] : ["SUPPLIER", "EMPLOYEE"] });
}

type InvoiceScope = {
  tenantId: string; companyId: string; projectId: string | null; supplierContactId: string;
  subcontractCertificationId?: string | null;
};

/** SQL FKs are single-column: verify each endpoint before using an AP graph. */
export async function assertApInvoiceParents(
  invoice: InvoiceScope, db: Prisma.TransactionClient = prisma,
): Promise<void> {
  const [company, contact, project] = await Promise.all([
    db.company.findUnique({ where: { id: invoice.companyId }, select: { tenantId: true } }),
    db.contact.findUnique({ where: { id: invoice.supplierContactId }, select: { tenantId: true } }),
    invoice.projectId ? db.project.findUnique({ where: { id: invoice.projectId }, select: { tenantId: true, companyId: true } }) : null,
  ]);
  if (!company || company.tenantId !== invoice.tenantId || !contact || contact.tenantId !== invoice.tenantId ||
      (invoice.projectId && (!project || project.tenantId !== invoice.tenantId ||
        (project.companyId !== null && project.companyId !== invoice.companyId)))) {
    throw new ServiceError("CONFLICT", "La factura tiene relaciones de empresa, obra o contacto inconsistentes");
  }
  if (invoice.subcontractCertificationId) {
    const certification = await db.subcontractCertification.findUnique({ where: { id: invoice.subcontractCertificationId },
      include: { subcontract: true } });
    if (!certification || certification.tenantId !== invoice.tenantId || certification.companyId !== invoice.companyId ||
        certification.projectId !== invoice.projectId || certification.subcontractorContactId !== invoice.supplierContactId ||
        certification.subcontract.tenantId !== invoice.tenantId || certification.subcontract.companyId !== invoice.companyId ||
        certification.subcontract.projectId !== invoice.projectId || certification.subcontract.subcontractorContactId !== invoice.supplierContactId) {
      throw new ServiceError("CONFLICT", "La factura y su certificado de subcontrato tienen relaciones inconsistentes");
    }
  }
}

type PayableScope = InvoiceScope & { supplierInvoiceId: string; currency: string; originalAmount: Prisma.Decimal;
  paidAmount?: Prisma.Decimal; creditedAmount?: Prisma.Decimal };
type InvoiceFinancialScope = InvoiceScope & { id: string; currency: string; totalAmount: Prisma.Decimal; status: string; documentKind: string };

export function assertApPayableMatchesInvoice(payable: PayableScope, invoice: InvoiceFinancialScope | null, requireIssued = true): void {
  if (!invoice || invoice.id !== payable.supplierInvoiceId || invoice.tenantId !== payable.tenantId ||
      invoice.companyId !== payable.companyId || invoice.projectId !== payable.projectId ||
      invoice.supplierContactId !== payable.supplierContactId || invoice.currency !== payable.currency ||
      (requireIssued && invoice.status !== "ISSUED") || !["INVOICE", "DEBIT_NOTE"].includes(invoice.documentKind) ||
      !invoice.totalAmount.equals(payable.originalAmount)) {
    throw new ServiceError("CONFLICT", "La cuenta por pagar y su factura tienen relaciones o importes inconsistentes");
  }
  const paid = payable.paidAmount ?? new Prisma.Decimal(0), credited = payable.creditedAmount ?? new Prisma.Decimal(0);
  if (!payable.originalAmount.isFinite() || !payable.originalAmount.greaterThan(0) || !paid.isFinite() || !credited.isFinite() ||
      paid.lessThan(0) || credited.lessThan(0) || payable.originalAmount.minus(paid).minus(credited).lessThanOrEqualTo(new Prisma.Decimal(OBLIGATION_OPEN_BALANCE_EPSILON).negated())) {
    throw new ServiceError("CONFLICT", "La cuenta por pagar tiene importes o saldo inconsistentes");
  }
}
