import { Prisma, type AccountMovement, type Collection } from "@bloqer/database";
import { z } from "zod";
import { isCrossCompany } from "../company-scope";
import type { ServiceContext } from "../types";
import { ServiceError } from "../types";
import { OBLIGATION_OPEN_BALANCE_EPSILON } from "../finance/obligation-date";
import { createTenantModuleGate } from "../tenant-modules/tenant-module-gate";
import { assertTenantModuleEnabledWithGate } from "../tenant-modules/tenant-module.service";

export async function assertArTransactionModules(tx: Prisma.TransactionClient, ctx: ServiceContext, treasury = false): Promise<void> {
  const rows = await tx.tenantModuleSetting.findMany({ where: { tenantId: ctx.tenantId }, select: { moduleKey: true, isEnabled: true } });
  const gate = createTenantModuleGate(new Map(rows.map((row) => [row.moduleKey, row.isEnabled])));
  assertTenantModuleEnabledWithGate(gate, "AR");
  if (treasury) assertTenantModuleEnabledWithGate(gate, "TREASURY");
}

export function parseArInput<S extends z.ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new ServiceError("VALIDATION", parsed.error.issues[0]?.message ?? "Datos inválidos");
  return parsed.data;
}

export function assertArDateRange(issueDate: string | Date, dueDate: string | Date): void {
  if (new Date(dueDate).getTime() < new Date(issueDate).getTime()) {
    throw new ServiceError("VALIDATION", "La fecha de vencimiento no puede ser anterior a la de emisión");
  }
}

export const arInvoiceParents = {
  company: { select: { id: true, tenantId: true } },
  clientContact: { select: { id: true, tenantId: true } },
  project: { select: { id: true, tenantId: true, companyId: true } },
  certification: { select: { id: true, tenantId: true, companyId: true, projectId: true } },
  referencedSalesInvoice: { select: { id: true, tenantId: true, companyId: true, projectId: true, clientContactId: true, currency: true, documentKind: true } },
} as const satisfies Prisma.SalesInvoiceInclude;

export const arReceivableParents = {
  company: { select: { id: true, tenantId: true } },
  clientContact: { select: { id: true, tenantId: true } },
  project: { select: { id: true, tenantId: true, companyId: true } },
  salesInvoice: { include: arInvoiceParents },
} as const satisfies Prisma.ReceivableInclude;

export const arCollectionParents = {
  company: { select: { id: true, tenantId: true } },
  clientContact: { select: { id: true, tenantId: true } },
  project: { select: { id: true, tenantId: true, companyId: true } },
  account: true,
  receivable: { include: arReceivableParents },
  salesInvoice: { include: arInvoiceParents },
} as const satisfies Prisma.CollectionInclude;

type Root = {
  tenantId: string; companyId: string; projectId: string | null; clientContactId: string;
  company: { id: string; tenantId: string };
  clientContact: { id: string; tenantId: string };
  project: { id: string; tenantId: string; companyId: string | null } | null;
};

function inconsistent(): never {
  throw new ServiceError("CONFLICT", "Las relaciones del comprobante financiero son inconsistentes");
}

export function assertArRoot(root: Root, ctx: ServiceContext): void {
  if (root.tenantId !== ctx.tenantId || isCrossCompany(root.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "El comprobante no pertenece al contexto autorizado");
  }
  if (root.company.id !== root.companyId || root.company.tenantId !== root.tenantId ||
      root.clientContact.id !== root.clientContactId || root.clientContact.tenantId !== root.tenantId ||
      (root.projectId === null ? root.project !== null : !root.project ||
        root.project.id !== root.projectId || root.project.tenantId !== root.tenantId ||
        (root.project.companyId !== null && root.project.companyId !== root.companyId))) inconsistent();
}

type Invoice = Root & {
  id: string; currency: string; certificationId: string | null; documentKind: string;
  totalAmount: Prisma.Decimal; status: string;
  referencedSalesInvoiceId?: string | null;
  referencedSalesInvoice?: {
    id: string; tenantId: string; companyId: string; projectId: string | null;
    clientContactId: string; currency: string; documentKind: string;
  } | null;
  certification: { id: string; tenantId: string; companyId: string | null; projectId: string } | null;
};

export function assertArInvoiceParents(invoice: Invoice, ctx: ServiceContext): void {
  assertArRoot(invoice, ctx);
  if (invoice.certificationId !== null && (!invoice.certification || invoice.documentKind !== "INVOICE" ||
      invoice.certification.id !== invoice.certificationId || invoice.certification.tenantId !== invoice.tenantId ||
      invoice.certification.projectId !== invoice.projectId ||
      (invoice.certification.companyId !== null && invoice.certification.companyId !== invoice.companyId))) inconsistent();
  if (invoice.documentKind !== "INVOICE") {
    const parent = invoice.referencedSalesInvoice;
    if (!parent || parent.id !== invoice.referencedSalesInvoiceId || parent.documentKind !== "INVOICE" ||
        parent.tenantId !== invoice.tenantId || parent.companyId !== invoice.companyId ||
        parent.projectId !== invoice.projectId || parent.clientContactId !== invoice.clientContactId ||
        parent.currency !== invoice.currency) inconsistent();
  }
}

type Receivable = Root & {
  id: string; salesInvoiceId: string; currency: string; salesInvoice: Invoice;
  originalAmount: Prisma.Decimal; paidAmount: Prisma.Decimal; creditedAmount: Prisma.Decimal; status: string;
};

export function assertArReceivableParents(receivable: Receivable, ctx: ServiceContext): void {
  assertArRoot(receivable, ctx);
  assertArInvoiceParents(receivable.salesInvoice, ctx);
  const invoice = receivable.salesInvoice;
  if (invoice.id !== receivable.salesInvoiceId || invoice.tenantId !== receivable.tenantId ||
      invoice.companyId !== receivable.companyId || invoice.projectId !== receivable.projectId ||
      invoice.clientContactId !== receivable.clientContactId || invoice.currency !== receivable.currency ||
      !["INVOICE", "DEBIT_NOTE"].includes(invoice.documentKind) ||
      !invoice.totalAmount.eq(receivable.originalAmount) || receivable.originalAmount.lte(0) ||
      receivable.paidAmount.lt(0) || receivable.creditedAmount.lt(0) ||
      receivable.paidAmount.plus(receivable.creditedAmount).minus(receivable.originalAmount).gte(OBLIGATION_OPEN_BALANCE_EPSILON) ||
      (receivable.status !== "CANCELLED" && invoice.status !== "ISSUED")) inconsistent();
}

export function assertArCollectionParents(collection: Root & {
  salesInvoiceId: string; receivableId: string; accountId: string; currency: string;
  salesInvoice: Invoice; receivable: Receivable;
  account: { id: string; tenantId: string; companyId: string | null; currency: string };
}, ctx: ServiceContext): void {
  assertArRoot(collection, ctx);
  assertArReceivableParents(collection.receivable, ctx);
  assertArInvoiceParents(collection.salesInvoice, ctx);
  const r = collection.receivable;
  if (r.id !== collection.receivableId || r.salesInvoiceId !== collection.salesInvoiceId ||
      r.tenantId !== collection.tenantId || r.companyId !== collection.companyId ||
      r.projectId !== collection.projectId || r.clientContactId !== collection.clientContactId ||
      r.currency !== collection.currency || collection.account.id !== collection.accountId ||
      collection.account.tenantId !== collection.tenantId || collection.account.currency !== collection.currency ||
      (collection.account.companyId !== null && collection.account.companyId !== collection.companyId)) inconsistent();
}

export function arCancellationReason(status: string, reason?: string): string | null {
  const normalized = reason?.trim() || null;
  if ((status === "ISSUED" || status === "CONFIRMED") && !normalized) {
    throw new ServiceError("VALIDATION", "Ingresá el motivo de la anulación");
  }
  return normalized;
}

/** A confirmed collection has one exact cash leg; an absent or duplicate leg is not a reversal. */
export function collectionMovementForCancellation(collection: Pick<Collection,
  "id" | "tenantId" | "companyId" | "projectId" | "accountId" | "currency" | "amount" | "collectionDate"
>, movements: AccountMovement[]): AccountMovement {
  const movement = movements[0];
  if (movements.length !== 1 || !movement || movement.tenantId !== collection.tenantId ||
      movement.companyId !== collection.companyId || movement.projectId !== collection.projectId ||
      movement.accountId !== collection.accountId || movement.currency !== collection.currency ||
      !movement.amount.eq(collection.amount) || movement.type !== "INFLOW" ||
      movement.sourceType !== "COLLECTION" || movement.sourceId !== collection.id ||
      movement.movementDate.getTime() !== collection.collectionDate.getTime() ||
      !["CONFIRMED", "RECONCILED"].includes(movement.status)) {
    throw new ServiceError("CONFLICT", "La cobranza y su movimiento de tesorería no coinciden");
  }
  if (movement.status === "RECONCILED") {
    throw new ServiceError("CONFLICT", "El movimiento de tesorería está conciliado. Desconciliá antes de cancelar la cobranza.");
  }
  return movement;
}

/** Scope relations are server-only evidence, never extra DTO payload. */
export function stripArParents<T extends object>(row: T): T {
  const copy = { ...row } as Record<string, unknown>;
  for (const key of ["company", "project", "clientContact", "certification", "salesInvoice", "receivable", "account", "referencedSalesInvoice"]) delete copy[key];
  return copy as T;
}
