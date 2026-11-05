import { type Prisma } from "@bloqer/database";
import {
  computeObligationBalanceDue,
  normalizeObligationBalanceDue,
} from "../finance/obligation-balance";
import { resolveObligationStoredStatus } from "../finance/obligation-stored-status";
import { serializeMoneyDecimal } from "../finance/money-decimal";

const receivableSelect = {
  id: true,
  tenantId: true,
  companyId: true,
  projectId: true,
  clientContactId: true,
  salesInvoiceId: true,
  currency: true,
  originalAmount: true,
  paidAmount: true,
  creditedAmount: true,
  status: true,
} as const satisfies Prisma.ReceivableSelect;

const invoiceSelect = {
  id: true,
  tenantId: true,
  companyId: true,
  projectId: true,
  clientContactId: true,
  number: true,
  status: true,
  currency: true,
  totalAmount: true,
  documentKind: true,
  referencedSalesInvoiceId: true,
  company: { select: { tenantId: true } },
  clientContact: { select: { tenantId: true } },
  receivable: { select: receivableSelect },
} as const satisfies Prisma.SalesInvoiceSelect;

export const certificationInvoiceStatusSelect = {
  ...invoiceSelect,
  creditDebitNotes: {
    where: { documentKind: "DEBIT_NOTE", status: "ISSUED" },
    select: invoiceSelect,
  },
} as const satisfies Prisma.SalesInvoiceSelect;

type Invoice = Prisma.SalesInvoiceGetPayload<{ select: typeof invoiceSelect }>;
type InvoiceWithNotes = Prisma.SalesInvoiceGetPayload<{
  select: typeof certificationInvoiceStatusSelect;
}>;

/** Existing D-115 amounts/statuses are facts; a missing or contradictory obligation is unavailable. */
function obligationState(invoice: Invoice) {
  const r = invoice.receivable;
  if (
    !r ||
    r.tenantId !== invoice.tenantId ||
    r.companyId !== invoice.companyId ||
    r.projectId !== invoice.projectId ||
    r.clientContactId !== invoice.clientContactId ||
    r.salesInvoiceId !== invoice.id ||
    r.currency !== invoice.currency ||
    invoice.company.tenantId !== invoice.tenantId ||
    invoice.clientContact.tenantId !== invoice.tenantId ||
    serializeMoneyDecimal(r.originalAmount) !== serializeMoneyDecimal(invoice.totalAmount) ||
    r.originalAmount.isNegative() ||
    r.paidAmount.isNegative() ||
    r.creditedAmount.isNegative() ||
    r.status === "CANCELLED"
  )
    return null;
  const balance = computeObligationBalanceDue(r.originalAmount, r.paidAmount, r.creditedAmount);
  if (balance.isNegative() && !normalizeObligationBalanceDue(balance.abs()).isZero()) return null;
  const expected = resolveObligationStoredStatus(r.paidAmount, r.originalAmount, r.creditedAmount);
  const stored = r.status === "OVERDUE" ? (expected === "PAID" ? "OVERDUE" : expected) : r.status;
  if (stored !== expected) return null;
  return {
    settled: expected === "PAID" && normalizeObligationBalanceDue(balance).isZero(),
    id: r.id,
  };
}

export function deriveCertificationInvoiceStatus(invoice: InvoiceWithNotes): {
  isSettled: boolean;
  collectionStatusAvailable: boolean;
  receivableId: string | null;
  canCollect: boolean;
} {
  const unknown = {
    isSettled: false,
    collectionStatusAvailable: false,
    receivableId: null,
    canCollect: false,
  };
  if (invoice.status !== "ISSUED")
    return { ...unknown, collectionStatusAvailable: invoice.status === "DRAFT" };
  const original = obligationState(invoice);
  if (!original) return unknown;
  for (const note of invoice.creditDebitNotes) {
    if (
      note.tenantId !== invoice.tenantId ||
      note.companyId !== invoice.companyId ||
      note.projectId !== invoice.projectId ||
      note.clientContactId !== invoice.clientContactId ||
      note.currency !== invoice.currency ||
      note.referencedSalesInvoiceId !== invoice.id ||
      !obligationState(note)
    )
      return unknown;
  }
  return {
    isSettled:
      original.settled && invoice.creditDebitNotes.every((note) => obligationState(note)?.settled),
    collectionStatusAvailable: true,
    receivableId: original.settled ? null : original.id,
    canCollect: !original.settled,
  };
}
