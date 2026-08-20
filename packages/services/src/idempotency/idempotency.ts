import { createHash } from "node:crypto";
import { Prisma } from "@bloqer/database";
import { isUuid } from "@bloqer/utils";
import { resolveInvoiceLineMoney } from "../finance/invoice-line-money";
import {
  serializeMoneyDecimal,
  serializeQtyDecimal,
  serializeRatePctDecimal,
  serializeUnitPriceDecimal,
} from "../finance/money-decimal";
import { ServiceError } from "../types";

const CONFLICT_MESSAGE = "Esta operación ya se registró con datos distintos. Recargá e intentá de nuevo.";

export function requireIdempotencyKey(raw: string | null | undefined): string {
  if (typeof raw !== "string" || !isUuid(raw)) {
    throw new ServiceError("VALIDATION", "Clave de idempotencia inválida");
  }
  return raw.toLowerCase();
}

export function isIdempotencyUniqueConflict(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") {
    return false;
  }
  const haystack = JSON.stringify({
    target: err.meta?.target,
    constraint: err.meta?.constraint,
    modelName: err.meta?.modelName,
  }).toLowerCase();
  return haystack.includes("idempotency");
}

export function assertIdempotentPayloadMatch(same: boolean, message = CONFLICT_MESSAGE): void {
  if (!same) throw new ServiceError("CONFLICT", message);
}

export function dateOnlyFingerprint(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function moneyFingerprint(value: { toString(): string } | string): string {
  return serializeMoneyDecimal(value);
}

export function qtyFingerprint(value: { toString(): string } | string): string {
  return serializeQtyDecimal(value);
}

export function sha256Hex(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export function paymentReplayMatches(
  existing: {
    payableId: string;
    accountId: string;
    paymentDate: Date;
    amount: { toString(): string };
    status: string;
  },
  input: {
    payableId: string;
    accountId: string;
    paymentDate: string;
    payFullBalance: boolean;
    amount: string | null | undefined;
  },
): boolean {
  if (existing.status !== "CONFIRMED") return false;
  if (existing.payableId !== input.payableId) return false;
  if (existing.accountId !== input.accountId) return false;
  if (dateOnlyFingerprint(existing.paymentDate) !== input.paymentDate) return false;
  if (input.payFullBalance) return true;
  if (input.amount == null) return false;
  return moneyFingerprint(existing.amount) === moneyFingerprint(input.amount);
}

export function collectionReplayMatches(
  existing: {
    receivableId: string;
    accountId: string;
    collectionDate: Date;
    amount: { toString(): string };
    status: string;
  },
  input: {
    receivableId: string;
    accountId: string;
    collectionDate: string;
    collectFullBalance: boolean;
    amount: string | null | undefined;
  },
): boolean {
  if (existing.status !== "CONFIRMED") return false;
  if (existing.receivableId !== input.receivableId) return false;
  if (existing.accountId !== input.accountId) return false;
  if (dateOnlyFingerprint(existing.collectionDate) !== input.collectionDate) return false;
  if (input.collectFullBalance) return true;
  if (input.amount == null) return false;
  return moneyFingerprint(existing.amount) === moneyFingerprint(input.amount);
}

export function transferReplayMatches(
  existing: {
    sourceAccountId: string;
    destinationAccountId: string;
    transferDate: Date;
    amount: { toString(): string };
    status: string;
  },
  input: {
    sourceAccountId: string;
    destinationAccountId: string;
    transferDate: string;
    amount: string;
  },
): boolean {
  if (existing.status !== "CONFIRMED") return false;
  return (
    existing.sourceAccountId === input.sourceAccountId &&
    existing.destinationAccountId === input.destinationAccountId &&
    dateOnlyFingerprint(existing.transferDate) === input.transferDate &&
    moneyFingerprint(existing.amount) === moneyFingerprint(input.amount)
  );
}

export function consumptionReplayMatches(
  existing: {
    warehouseId: string;
    productId: string;
    projectId: string | null;
    wbsNodeId: string | null;
    movementDate: Date;
    quantity: { toString(): string };
    status: string;
  },
  input: {
    warehouseId: string;
    productId: string;
    projectId: string | null | undefined;
    wbsNodeId: string | null | undefined;
    movementDate: string;
    quantity: string;
  },
): boolean {
  if (existing.status !== "CONFIRMED") return false;
  return (
    existing.warehouseId === input.warehouseId &&
    existing.productId === input.productId &&
    (existing.projectId ?? null) === (input.projectId ?? null) &&
    (existing.wbsNodeId ?? null) === (input.wbsNodeId ?? null) &&
    dateOnlyFingerprint(existing.movementDate) === input.movementDate &&
    qtyFingerprint(existing.quantity) === qtyFingerprint(input.quantity)
  );
}

export function warehouseTransferReplayMatches(
  existing: {
    sourceWarehouseId: string;
    destinationWarehouseId: string;
    productId: string;
    projectId: string | null;
    transferDate: Date;
    quantity: { toString(): string };
    status: string;
  },
  input: {
    sourceWarehouseId: string;
    destinationWarehouseId: string;
    productId: string;
    projectId: string | null | undefined;
    transferDate: string;
    quantity: string;
  },
): boolean {
  if (existing.status !== "CONFIRMED") return false;
  return (
    existing.sourceWarehouseId === input.sourceWarehouseId &&
    existing.destinationWarehouseId === input.destinationWarehouseId &&
    existing.productId === input.productId &&
    (existing.projectId ?? null) === (input.projectId ?? null) &&
    dateOnlyFingerprint(existing.transferDate) === input.transferDate &&
    qtyFingerprint(existing.quantity) === qtyFingerprint(input.quantity)
  );
}

export function treasuryMovementReplayMatches(
  existing: {
    accountId: string;
    movementDate: Date;
    type: string;
    amount: { toString(): string };
    description: string;
    status: string;
    counterpartyContactId?: string | null;
    externalInvoiceRef?: string | null;
  },
  input: {
    accountId: string;
    movementDate: string;
    type: string;
    amount: string;
    description: string;
    counterpartyContactId?: string | null;
    externalInvoiceRef?: string | null;
  },
): boolean {
  if (existing.status !== "CONFIRMED") return false;
  if (existing.accountId !== input.accountId) return false;
  if (dateOnlyFingerprint(existing.movementDate) !== input.movementDate) return false;
  if (existing.type !== input.type) return false;
  if (moneyFingerprint(existing.amount) !== moneyFingerprint(input.amount)) return false;
  if (existing.description !== input.description) return false;
  if ((existing.counterpartyContactId ?? null) !== (input.counterpartyContactId ?? null)) return false;
  if ((existing.externalInvoiceRef ?? null) !== (input.externalInvoiceRef ?? null)) return false;
  return true;
}

export type InvoiceLineReplayInput = {
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate?: string;
  sortOrder?: number;
  wbsNodeId?: string | null;
  purchaseOrderLineId?: string | null;
  certificationLineId?: string | null;
};

type InvoiceLineReplayExisting = {
  description: string;
  quantity: { toString(): string };
  unitPrice: { toString(): string };
  taxRate: { toString(): string };
  sortOrder: number;
  wbsNodeId?: string | null;
  purchaseOrderLineId?: string | null;
  certificationLineId?: string | null;
};

function invoiceLinesReplayMatch(
  existing: InvoiceLineReplayExisting[],
  input: InvoiceLineReplayInput[],
  opts: { forceZeroTax: boolean; pricesIncludeTax: boolean; kind: "ap" | "ar" },
): boolean {
  if (existing.length !== input.length) return false;
  const sortedExisting = [...existing].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.description.localeCompare(b.description),
  );
  const sortedInput = [...input].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.description.localeCompare(b.description),
  );
  for (let i = 0; i < sortedExisting.length; i++) {
    const line = sortedInput[i]!;
    const got = sortedExisting[i]!;
    const qty = new Prisma.Decimal(line.quantity);
    const price = new Prisma.Decimal(line.unitPrice);
    const rate = new Prisma.Decimal(opts.forceZeroTax ? "0" : (line.taxRate ?? "0"));
    const expected = resolveInvoiceLineMoney({
      quantity: qty,
      unitPrice: price,
      taxRate: rate,
      pricesIncludeTax: opts.pricesIncludeTax,
    });
    if (got.description !== line.description) return false;
    if (qtyFingerprint(got.quantity) !== qtyFingerprint(qty)) return false;
    if (serializeUnitPriceDecimal(got.unitPrice) !== serializeUnitPriceDecimal(expected.unitPriceNet)) {
      return false;
    }
    if (serializeRatePctDecimal(got.taxRate) !== serializeRatePctDecimal(rate)) return false;
    if (got.sortOrder !== (line.sortOrder ?? 0)) return false;
    if (opts.kind === "ap") {
      if ((got.wbsNodeId ?? null) !== (line.wbsNodeId ?? null)) return false;
      if ((got.purchaseOrderLineId ?? null) !== (line.purchaseOrderLineId ?? null)) return false;
    } else if ((got.certificationLineId ?? null) !== (line.certificationLineId ?? null)) {
      return false;
    }
  }
  return true;
}

function sameTxnInstant(a: Date, b: Date): boolean {
  return a.getTime() === b.getTime();
}

/** Composite invoice + payment/collection are inserted in one PG transaction. */
const COMPOSITE_TXN_WINDOW_MS = 2_000;

export function pickSameTransactionRow<T extends { createdAt: Date }>(
  parentCreatedAt: Date,
  rows: T[],
): T | undefined {
  if (rows.length === 0) return undefined;
  const exact = rows.find((row) => sameTxnInstant(row.createdAt, parentCreatedAt));
  if (exact) return exact;
  return rows.find(
    (row) => Math.abs(row.createdAt.getTime() - parentCreatedAt.getTime()) <= COMPOSITE_TXN_WINDOW_MS,
  );
}

type PayNowReplayInput = {
  accountId: string;
  paymentDate: string;
  payFullBalance?: boolean;
  amount?: string | null;
};

type CollectNowReplayInput = {
  accountId: string;
  collectionDate: string;
  collectFullBalance?: boolean;
  amount?: string | null;
};

/** Composite payNow: same-txn window, then payload match (retry after clock skew). */
export function pickCompositePayment<
  T extends {
    payableId: string;
    accountId: string;
    paymentDate: Date;
    amount: { toString(): string };
    status: string;
    createdAt: Date;
  },
>(
  parentCreatedAt: Date,
  payableId: string | null,
  rows: T[],
  payNow?: PayNowReplayInput,
): T | undefined {
  const immediate = pickSameTransactionRow(parentCreatedAt, rows);
  if (!payNow) return immediate;
  if (!payableId) return undefined;
  const matches = (row: T) =>
    paymentReplayMatches(row, {
      payableId,
      accountId: payNow.accountId,
      paymentDate: payNow.paymentDate,
      payFullBalance: Boolean(payNow.payFullBalance),
      amount: payNow.amount,
    });
  if (immediate && matches(immediate)) return immediate;
  return rows.find(matches);
}

/** Composite collectNow: same-txn window, then payload match (retry after clock skew). */
export function pickCompositeCollection<
  T extends {
    receivableId: string;
    accountId: string;
    collectionDate: Date;
    amount: { toString(): string };
    status: string;
    createdAt: Date;
  },
>(
  parentCreatedAt: Date,
  receivableId: string | null,
  rows: T[],
  collectNow?: CollectNowReplayInput,
): T | undefined {
  const immediate = pickSameTransactionRow(parentCreatedAt, rows);
  if (!collectNow) return immediate;
  if (!receivableId) return undefined;
  const matches = (row: T) =>
    collectionReplayMatches(row, {
      receivableId,
      accountId: collectNow.accountId,
      collectionDate: collectNow.collectionDate,
      collectFullBalance: Boolean(collectNow.collectFullBalance),
      amount: collectNow.amount,
    });
  if (immediate && matches(immediate)) return immediate;
  return rows.find(matches);
}

export function registerApExpenseReplayMatches(
  existing: {
    status: string;
    supplierContactId: string;
    projectId: string | null;
    issueDate: Date;
    dueDate: Date;
    currency: string;
    invoiceLetter: string | null;
    purchaseOrderId: string | null;
    createdAt: Date;
    payableId: string | null;
    lines: InvoiceLineReplayExisting[];
    payments: Array<{
      payableId: string;
      accountId: string;
      paymentDate: Date;
      amount: { toString(): string };
      status: string;
      createdAt: Date;
    }>;
  },
  input: {
    projectId?: string | null;
    supplierContactId: string;
    issueDate: string;
    dueDate: string;
    currency?: string;
    invoiceLetter?: string | null;
    purchaseOrderId?: string | null;
    pricesIncludeTax?: boolean;
    lines: InvoiceLineReplayInput[];
    payNow?: {
      accountId: string;
      paymentDate: string;
      payFullBalance?: boolean;
      amount?: string | null;
    };
  },
): boolean {
  if (existing.status !== "ISSUED") return false;
  if (!existing.payableId) return false;
  if (existing.supplierContactId !== input.supplierContactId) return false;
  if ((existing.projectId ?? null) !== (input.projectId ?? null)) return false;
  if (dateOnlyFingerprint(existing.issueDate) !== input.issueDate) return false;
  if (dateOnlyFingerprint(existing.dueDate) !== input.dueDate) return false;
  if (existing.currency !== (input.currency ?? "ARS")) return false;
  if ((existing.invoiceLetter ?? null) !== (input.invoiceLetter ?? null)) return false;
  if ((existing.purchaseOrderId ?? null) !== (input.purchaseOrderId ?? null)) return false;
  const forceZeroTax = input.invoiceLetter === "C" || input.invoiceLetter === "E";
  const pricesIncludeTax = forceZeroTax ? false : Boolean(input.pricesIncludeTax);
  if (!invoiceLinesReplayMatch(existing.lines, input.lines, { forceZeroTax, pricesIncludeTax, kind: "ap" })) {
    return false;
  }
  const immediatePayment = pickSameTransactionRow(existing.createdAt, existing.payments) ?? null;
  if (input.payNow) {
    return Boolean(
      pickCompositePayment(existing.createdAt, existing.payableId, existing.payments, input.payNow),
    );
  }
  return immediatePayment == null;
}

export function registerArSaleReplayMatches(
  existing: {
    status: string;
    clientContactId: string;
    projectId: string | null;
    issueDate: Date;
    dueDate: Date;
    currency: string;
    invoiceLetter: string | null;
    externalInvoiceRef: string | null;
    createdAt: Date;
    receivableId: string | null;
    lines: InvoiceLineReplayExisting[];
    collections: Array<{
      receivableId: string;
      accountId: string;
      collectionDate: Date;
      amount: { toString(): string };
      status: string;
      createdAt: Date;
    }>;
  },
  input: {
    projectId?: string | null;
    clientContactId: string;
    issueDate: string;
    dueDate: string;
    currency?: string;
    invoiceLetter?: string | null;
    externalInvoiceRef?: string | null;
    pricesIncludeTax?: boolean;
    lines: InvoiceLineReplayInput[];
    collectNow?: {
      accountId: string;
      collectionDate: string;
      collectFullBalance?: boolean;
      amount?: string | null;
    };
  },
): boolean {
  if (existing.status !== "ISSUED") return false;
  if (!existing.receivableId) return false;
  if (existing.clientContactId !== input.clientContactId) return false;
  if ((existing.projectId ?? null) !== (input.projectId ?? null)) return false;
  if (dateOnlyFingerprint(existing.issueDate) !== input.issueDate) return false;
  if (dateOnlyFingerprint(existing.dueDate) !== input.dueDate) return false;
  if (existing.currency !== (input.currency ?? "ARS")) return false;
  if ((existing.invoiceLetter ?? null) !== (input.invoiceLetter ?? null)) return false;
  if ((existing.externalInvoiceRef ?? null) !== (input.externalInvoiceRef ?? null)) return false;
  const forceZeroTax = input.invoiceLetter === "C" || input.invoiceLetter === "E";
  const pricesIncludeTax = forceZeroTax ? false : Boolean(input.pricesIncludeTax);
  if (!invoiceLinesReplayMatch(existing.lines, input.lines, { forceZeroTax, pricesIncludeTax, kind: "ar" })) {
    return false;
  }
  const immediateCollection = pickSameTransactionRow(existing.createdAt, existing.collections) ?? null;
  if (input.collectNow) {
    return Boolean(
      pickCompositeCollection(
        existing.createdAt,
        existing.receivableId,
        existing.collections,
        input.collectNow,
      ),
    );
  }
  return immediateCollection == null;
}

export function documentReplayMatches(
  existing: {
    contentSha256: string | null;
    linkedEntityType: string | null;
    linkedEntityId: string | null;
    status: string;
  },
  input: {
    contentSha256: string;
    linkedEntityType: string | null | undefined;
    linkedEntityId: string | null | undefined;
  },
): boolean {
  if (existing.status !== "ACTIVE") return false;
  if (!existing.contentSha256 || existing.contentSha256 !== input.contentSha256) return false;
  return (
    (existing.linkedEntityType ?? null) === (input.linkedEntityType ?? null) &&
    (existing.linkedEntityId ?? null) === (input.linkedEntityId ?? null)
  );
}

export async function withIdempotentCreate<T>(params: {
  findExisting: () => Promise<T | null>;
  payloadsMatch: (existing: T) => boolean;
  create: () => Promise<T>;
}): Promise<T> {
  const existing = await params.findExisting();
  if (existing) {
    assertIdempotentPayloadMatch(params.payloadsMatch(existing));
    return existing;
  }
  try {
    return await params.create();
  } catch (err) {
    if (!isIdempotencyUniqueConflict(err)) throw err;
    const raced = await params.findExisting();
    if (!raced) throw err;
    assertIdempotentPayloadMatch(params.payloadsMatch(raced));
    return raced;
  }
}
