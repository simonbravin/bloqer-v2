import { Prisma, prisma } from "@bloqer/database";
import { canViewApProjectArea } from "../ap/ap-access";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import {
  computeObligationBalanceDue,
  normalizeObligationBalanceDue,
} from "../finance/obligation-balance";
import { resolveObligationStoredStatus } from "../finance/obligation-stored-status";
import { hasOpenObligationBalance, isObligationOverdue } from "../finance/obligation-date";
import { serializeMoneyDecimal } from "../finance/money-decimal";
import type { ServiceContext } from "../types";
import type { SubcontractCertificationRecord } from "./subcontract-scope";

export type SubcontractSettlementStatus = "UNSETTLED" | "PARTIALLY_SETTLED" | "SETTLED" | "OVERDUE";
export type SubcontractSettlement = {
  settlementStatus: SubcontractSettlementStatus | null;
  settlementUnavailableReason: string | null;
};
const unavailable = (reason: string): SubcontractSettlement => ({
  settlementStatus: null,
  settlementUnavailableReason: reason,
});
const unset: SubcontractSettlement = {
  settlementStatus: "UNSETTLED",
  settlementUnavailableReason: null,
};

const settlementInvoiceSelect = {
  id: true,
  tenantId: true,
  companyId: true,
  projectId: true,
  supplierContactId: true,
  subcontractCertificationId: true,
  status: true,
  documentKind: true,
  currency: true,
  totalAmount: true,
  referencedSupplierInvoiceId: true,
  purchaseOrderId: true,
} as const satisfies Prisma.SupplierInvoiceSelect;
const settlementInclude = {
  supplierInvoice: { select: settlementInvoiceSelect },
  payments: {
    where: { status: "CONFIRMED" },
    include: { account: { select: { tenantId: true, companyId: true, currency: true } } },
  },
  creditApplications: {
    where: { status: "CONFIRMED" },
    include: {
      creditNoteSupplierInvoice: {
        select: {
          tenantId: true,
          companyId: true,
          projectId: true,
          supplierContactId: true,
          documentKind: true,
          status: true,
          currency: true,
          referencedSupplierInvoiceId: true,
          totalAmount: true,
        },
      },
    },
  },
} as const satisfies Prisma.PayableInclude;
type SettlementPayable = Prisma.PayableGetPayload<{ include: typeof settlementInclude }>;
const debitNoteSelect = {
  ...settlementInvoiceSelect,
  payable: { include: settlementInclude },
} as const satisfies Prisma.SupplierInvoiceSelect;
type SettlementDebitNote = Prisma.SupplierInvoiceGetPayload<{ select: typeof debitNoteSelect }>;
type SettlementSource = {
  id: string;
  tenantId: string;
  companyId: string;
  projectId: string;
  subcontractorContactId: string;
  currency: string;
  invoiceId: string;
};
const inconsistentObligation = () =>
  unavailable(
    "No se pudo comprobar una obligación consistente. Revisá la factura y su cuenta por pagar.",
  );

/** D027 + D115: debt settlement includes credit notes; it does not assert cash payment. */
function deriveObligationSettlement(
  payable: SettlementPayable | null,
  source: SettlementSource,
  document: { id: string; kind: "INVOICE" | "DEBIT_NOTE" },
  asOf?: Date,
): SubcontractSettlement {
  const bad = inconsistentObligation;
  if (!payable || payable.status === "CANCELLED") return bad();
  const invoice = payable.supplierInvoice;
  if (
    payable.tenantId !== source.tenantId ||
    payable.companyId !== source.companyId ||
    payable.projectId !== source.projectId ||
    payable.supplierContactId !== source.subcontractorContactId ||
    payable.supplierInvoiceId !== document.id ||
    invoice.id !== document.id ||
    invoice.tenantId !== source.tenantId ||
    invoice.companyId !== source.companyId ||
    invoice.projectId !== source.projectId ||
    invoice.supplierContactId !== source.subcontractorContactId ||
    invoice.subcontractCertificationId !== (document.kind === "INVOICE" ? source.id : null) ||
    invoice.status !== "ISSUED" ||
    invoice.documentKind !== document.kind ||
    invoice.purchaseOrderId !== null ||
    invoice.referencedSupplierInvoiceId !== (document.kind === "INVOICE" ? null : source.invoiceId)
  )
    return bad();
  if (invoice.currency !== source.currency || payable.currency !== invoice.currency)
    return unavailable(
      "Las monedas del subcontrato y su obligación no son comparables. Consultá el documento de origen.",
    );
  if (
    !payable.originalAmount.isFinite() ||
    !payable.paidAmount.isFinite() ||
    !payable.creditedAmount.isFinite() ||
    !invoice.totalAmount.isFinite() ||
    payable.originalAmount.lessThanOrEqualTo(0) ||
    payable.paidAmount.lessThan(0) ||
    payable.creditedAmount.lessThan(0) ||
    serializeMoneyDecimal(payable.originalAmount) !== serializeMoneyDecimal(invoice.totalAmount)
  )
    return bad();
  let paid = new Prisma.Decimal(0),
    credited = new Prisma.Decimal(0);
  for (const payment of payable.payments) {
    if (payment.status !== "CONFIRMED") continue;
    if (
      payment.tenantId !== source.tenantId ||
      payment.companyId !== source.companyId ||
      payment.projectId !== source.projectId ||
      payment.supplierContactId !== source.subcontractorContactId ||
      payment.supplierInvoiceId !== document.id ||
      payment.payableId !== payable.id ||
      payment.currency !== payable.currency ||
      !payment.amount.isFinite() ||
      payment.amount.lessThanOrEqualTo(0) ||
      payment.account.tenantId !== source.tenantId ||
      (payment.account.companyId !== null && payment.account.companyId !== source.companyId) ||
      payment.account.currency !== payable.currency
    )
      return bad();
    paid = paid.plus(payment.amount);
  }
  for (const application of payable.creditApplications) {
    if (application.status !== "CONFIRMED") continue;
    const note = application.creditNoteSupplierInvoice;
    if (
      application.tenantId !== source.tenantId ||
      application.companyId !== source.companyId ||
      application.payableId !== payable.id ||
      !application.amount.isFinite() ||
      application.amount.lessThanOrEqualTo(0) ||
      note.tenantId !== source.tenantId ||
      note.companyId !== source.companyId ||
      note.projectId !== source.projectId ||
      note.supplierContactId !== source.subcontractorContactId ||
      note.documentKind !== "CREDIT_NOTE" ||
      note.status !== "ISSUED" ||
      document.kind !== "INVOICE" ||
      note.referencedSupplierInvoiceId !== document.id ||
      !note.totalAmount.isFinite() ||
      serializeMoneyDecimal(application.amount) !== serializeMoneyDecimal(note.totalAmount) ||
      note.currency !== payable.currency
    )
      return bad();
    credited = credited.plus(application.amount);
  }
  if (
    serializeMoneyDecimal(paid) !== serializeMoneyDecimal(payable.paidAmount) ||
    serializeMoneyDecimal(credited) !== serializeMoneyDecimal(payable.creditedAmount)
  )
    return bad();
  const rawBalance = computeObligationBalanceDue(
    payable.originalAmount,
    payable.paidAmount,
    payable.creditedAmount,
  );
  if (hasOpenObligationBalance(rawBalance.negated())) return bad();
  const balance = normalizeObligationBalanceDue(rawBalance);
  const stored = resolveObligationStoredStatus(
    payable.paidAmount,
    payable.originalAmount,
    payable.creditedAmount,
  );
  if (stored === "PAID") {
    if (payable.status !== "PAID" || !balance.isZero()) return bad();
    return { settlementStatus: "SETTLED", settlementUnavailableReason: null };
  }
  if (payable.status === "PAID") return bad();
  if (isObligationOverdue(payable.dueDate, asOf))
    return { settlementStatus: "OVERDUE", settlementUnavailableReason: null };
  return {
    settlementStatus: stored === "PARTIAL" ? "PARTIALLY_SETTLED" : "UNSETTLED",
    settlementUnavailableReason: null,
  };
}

/** D115 debit notes create independent debt: every issued obligation must be reconciled. */
export function deriveSubcontractSettlement(
  payable: SettlementPayable | null,
  source: SettlementSource,
  asOf?: Date,
  debitNotes: readonly SettlementDebitNote[] = [],
): SubcontractSettlement {
  const states = [
    deriveObligationSettlement(payable, source, { id: source.invoiceId, kind: "INVOICE" }, asOf),
  ];
  const ids = new Set<string>();
  for (const note of debitNotes) {
    if (note.status === "DRAFT" || note.status === "CANCELLED") continue;
    if (
      ids.has(note.id) ||
      note.id === source.invoiceId ||
      note.documentKind !== "DEBIT_NOTE" ||
      note.status !== "ISSUED" ||
      note.referencedSupplierInvoiceId !== source.invoiceId ||
      note.subcontractCertificationId !== null ||
      note.purchaseOrderId !== null ||
      note.tenantId !== source.tenantId ||
      note.companyId !== source.companyId ||
      note.projectId !== source.projectId ||
      note.supplierContactId !== source.subcontractorContactId ||
      note.currency !== source.currency ||
      !note.totalAmount.isFinite() ||
      note.totalAmount.lessThanOrEqualTo(0) ||
      !note.payable ||
      serializeMoneyDecimal(note.totalAmount) !==
        serializeMoneyDecimal(note.payable.supplierInvoice.totalAmount)
    )
      return inconsistentObligation();
    ids.add(note.id);
    states.push(
      deriveObligationSettlement(note.payable, source, { id: note.id, kind: "DEBIT_NOTE" }, asOf),
    );
  }
  const unknown = states.find((state) => state.settlementStatus === null);
  if (unknown) return unknown;
  if (states.some((state) => state.settlementStatus === "OVERDUE"))
    return { settlementStatus: "OVERDUE", settlementUnavailableReason: null };
  if (states.every((state) => state.settlementStatus === "SETTLED"))
    return { settlementStatus: "SETTLED", settlementUnavailableReason: null };
  if (
    states.some(
      (state) =>
        state.settlementStatus === "PARTIALLY_SETTLED" || state.settlementStatus === "SETTLED",
    )
  )
    return { settlementStatus: "PARTIALLY_SETTLED", settlementUnavailableReason: null };
  return unset;
}

export async function loadSubcontractSettlements(
  rows: readonly SubcontractCertificationRecord[],
  ctx: ServiceContext,
): Promise<Map<string, SubcontractSettlement>> {
  const result = new Map<string, SubcontractSettlement>();
  const gate = await getTenantModuleGate(ctx);
  if (!gate.isEnabled("AP") || !canViewApProjectArea(ctx.roles)) {
    for (const row of rows)
      result.set(
        row.id,
        unavailable("La liquidación no está disponible sin acceso a Cuentas por pagar (AP)."),
      );
    return result;
  }
  const issued = rows.filter((row) => row.supplierInvoice?.status === "ISSUED");
  const payables = issued.length
    ? await prisma.payable.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
          supplierInvoiceId: { in: issued.map((row) => row.supplierInvoice!.id) },
        },
        include: settlementInclude,
      })
    : [];
  const byInvoice = new Map(payables.map((payable) => [payable.supplierInvoiceId, payable]));
  const fiscalNotes = issued.length
    ? await prisma.supplierInvoice.findMany({
        // Scope the authorized parent; validate every issued child's endpoints rather than hiding malformed links.
        where: {
          tenantId: ctx.tenantId,
          ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
          id: { in: issued.map((row) => row.supplierInvoice!.id) },
        },
        select: {
          id: true,
          creditDebitNotes: {
            where: { documentKind: "DEBIT_NOTE", status: "ISSUED" },
            select: debitNoteSelect,
          },
        },
      })
    : [];
  const notesByInvoice = new Map(
    fiscalNotes.map((invoice) => [invoice.id, invoice.creditDebitNotes]),
  );
  for (const row of rows) {
    if (row.supplierInvoice?.status !== "ISSUED") result.set(row.id, unset);
    else
      result.set(
        row.id,
        !notesByInvoice.has(row.supplierInvoice.id)
          ? inconsistentObligation()
          : deriveSubcontractSettlement(
              byInvoice.get(row.supplierInvoice.id) ?? null,
              {
                ...row,
                currency: row.subcontract.currency,
                invoiceId: row.supplierInvoice.id,
              },
              undefined,
              notesByInvoice.get(row.supplierInvoice.id),
            ),
      );
  }
  return result;
}
