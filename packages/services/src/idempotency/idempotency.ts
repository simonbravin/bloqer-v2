import { createHash } from "node:crypto";
import { Prisma } from "@bloqer/database";
import { calcDocumentHeaderTaxTotals, DEFAULT_IIBB_PERCEPTION_RATE_PCT, isUuid, normalizeRichNote } from "@bloqer/utils";
import { resolveInvoiceLineMoney, parseDiscountPct } from "../finance/invoice-line-money";
import {
  serializeMoneyDecimal,
  serializeFxRateDecimal,
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

type SettlementReplayExisting = {
  currency?: string;
  paymentMethod?: string | null;
  reference?: string | null;
  notes?: string | null;
};
type SettlementReplayInput = {
  paymentMethod?: string | null;
  reference?: string | null;
  notes?: string | null;
};
function settlementReplayDetailsMatch(existing: SettlementReplayExisting, input: SettlementReplayInput & { fxRate?: string }): boolean {
  if (existing.currency && existing.currency !== "ARS" && input.fxRate == null) return false;
  return (existing.paymentMethod ?? null) === (input.paymentMethod ?? null) &&
    (existing.reference ?? null) === (input.reference ?? null) &&
    (existing.notes ?? null) === (input.notes ?? null);
}

export function paymentReplayMatches(
  existing: SettlementReplayExisting & {
    payableId: string;
    accountId: string;
    paymentDate: Date;
    amount: { toString(): string };
    fxRate?: { toString(): string };
    status: string;
  },
  input: SettlementReplayInput & {
    payableId: string;
    accountId: string;
    paymentDate: string;
    payFullBalance: boolean;
    amount: string | null | undefined;
    fxRate?: string;
  },
): boolean {
  if (existing.status !== "CONFIRMED") return false;
  if (!settlementReplayDetailsMatch(existing, input)) return false;
  if (existing.payableId !== input.payableId) return false;
  if (existing.accountId !== input.accountId) return false;
  if (dateOnlyFingerprint(existing.paymentDate) !== input.paymentDate) return false;
  if (input.fxRate != null && (!existing.fxRate || serializeFxRateDecimal(existing.fxRate) !== serializeFxRateDecimal(input.fxRate))) return false;
  if (input.payFullBalance) return true;
  if (input.amount == null) return false;
  return moneyFingerprint(existing.amount) === moneyFingerprint(input.amount);
}

export function collectionReplayMatches(
  existing: SettlementReplayExisting & {
    receivableId: string;
    accountId: string;
    collectionDate: Date;
    amount: { toString(): string };
    fxRate?: { toString(): string };
    status: string;
  },
  input: SettlementReplayInput & {
    receivableId: string;
    accountId: string;
    collectionDate: string;
    collectFullBalance: boolean;
    amount: string | null | undefined;
    fxRate?: string;
  },
): boolean {
  if (existing.status !== "CONFIRMED") return false;
  if (!settlementReplayDetailsMatch(existing, input)) return false;
  if (existing.receivableId !== input.receivableId) return false;
  if (existing.accountId !== input.accountId) return false;
  if (dateOnlyFingerprint(existing.collectionDate) !== input.collectionDate) return false;
  if (input.fxRate != null && (!existing.fxRate || serializeFxRateDecimal(existing.fxRate) !== serializeFxRateDecimal(input.fxRate))) return false;
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
  discountPct?: string;
  sortOrder?: number;
  wbsNodeId?: string | null;
  purchaseOrderLineId?: string | null;
  certificationLineId?: string | null;
  costAnalysisLineId?: string | null;
  costType?: string | null;
};

type InvoiceLineReplayExisting = {
  description: string;
  quantity: { toString(): string };
  unitPrice: { toString(): string };
  taxRate: { toString(): string };
  discountPct?: { toString(): string };
  sortOrder: number;
  wbsNodeId?: string | null;
  purchaseOrderLineId?: string | null;
  certificationLineId?: string | null;
  costAnalysisLineId?: string | null;
  costType?: string | null;
};

function invoiceLinesReplayMatch(
  existing: InvoiceLineReplayExisting[],
  input: InvoiceLineReplayInput[],
  opts: { forceZeroTax: boolean; pricesIncludeTax: boolean; kind: "ap" | "ar" },
): boolean {
  if (existing.length !== input.length) return false;
  const fingerprint = (line: InvoiceLineReplayExisting) => JSON.stringify([
    line.sortOrder, line.description, qtyFingerprint(line.quantity),
    serializeUnitPriceDecimal(line.unitPrice), serializeRatePctDecimal(line.taxRate),
    serializeRatePctDecimal(line.discountPct ?? "0"),
    ...(opts.kind === "ap"
      ? [line.wbsNodeId ?? null, line.purchaseOrderLineId ?? null, line.costAnalysisLineId ?? null]
      : [line.certificationLineId ?? null]),
  ]);
  const expectedEntries: Array<{ key: string; costType?: string | null }> = [];
  for (const line of input) {
    const qty = new Prisma.Decimal(line.quantity);
    const price = new Prisma.Decimal(line.unitPrice);
    const rate = new Prisma.Decimal(opts.forceZeroTax ? "0" : (line.taxRate ?? "0"));
    const discountPct = parseDiscountPct(line.discountPct);
    const expected = resolveInvoiceLineMoney({
      quantity: qty,
      unitPrice: price,
      taxRate: rate,
      discountPct,
      pricesIncludeTax: opts.pricesIncludeTax,
    });
    expectedEntries.push({ key: fingerprint({ ...line, sortOrder: line.sortOrder ?? 0, quantity: qty, unitPrice: expected.unitPriceNet, taxRate: rate, discountPct }), costType: opts.kind === "ap" ? line.costType : undefined });
  }
  const buckets = new Map<string, InvoiceLineReplayExisting[]>();
  for (const line of existing) {
    const key = fingerprint(line);
    const bucket = buckets.get(key) ?? [];
    bucket.push(line); buckets.set(key, bucket);
  }
  // Match explicit cost types first; omitted types are derived on the server and
  // retain their saved snapshot when the same operation is retried.
  expectedEntries.sort((a, b) => Number(Boolean(b.costType)) - Number(Boolean(a.costType)));
  for (const entry of expectedEntries) {
    const bucket = buckets.get(entry.key);
    if (!bucket?.length) return false;
    const index = entry.costType ? bucket.findIndex(line => line.costType === entry.costType) : 0;
    if (index < 0) return false;
    bucket.splice(index, 1);
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

type PayNowReplayInput = SettlementReplayInput & {
  accountId: string;
  paymentDate: string;
  payFullBalance?: boolean;
  amount?: string | null;
  fxRate?: string;
  idempotencyKey?: string;
};

type CollectNowReplayInput = SettlementReplayInput & {
  accountId: string;
  collectionDate: string;
  collectFullBalance?: boolean;
  amount?: string | null;
  fxRate?: string;
  idempotencyKey?: string;
};

/** Composite payNow: same-txn window, then payload match (retry after clock skew). */
export function pickCompositePayment<
  T extends SettlementReplayExisting & {
    payableId: string;
    accountId: string;
    paymentDate: Date;
    amount: { toString(): string };
    fxRate?: { toString(): string };
    idempotencyKey?: string | null;
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
      fxRate: payNow.fxRate,
      paymentMethod: payNow.paymentMethod,
      reference: payNow.reference,
      notes: payNow.notes,
    });
  if (payNow.idempotencyKey) return rows.find(row => row.idempotencyKey === payNow.idempotencyKey && matches(row));
  if (immediate && matches(immediate)) return immediate;
  return rows.find(matches);
}

/** Composite collectNow: same-txn window, then payload match (retry after clock skew). */
export function pickCompositeCollection<
  T extends SettlementReplayExisting & {
    receivableId: string;
    accountId: string;
    collectionDate: Date;
    amount: { toString(): string };
    fxRate?: { toString(): string };
    idempotencyKey?: string | null;
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
      fxRate: collectNow.fxRate,
      paymentMethod: collectNow.paymentMethod,
      reference: collectNow.reference,
      notes: collectNow.notes,
    });
  if (collectNow.idempotencyKey) return rows.find(row => row.idempotencyKey === collectNow.idempotencyKey && matches(row));
  if (immediate && matches(immediate)) return immediate;
  return rows.find(matches);
}

type DocumentFinancialReplayExisting = {
  currency: string;
  fxRate?: { toString(): string };
  subtotal?: { toString(): string };
  iibbPerceptionRate?: { toString(): string };
  iibbPerceptionAmount?: { toString(): string };
};

type DocumentFinancialReplayInput = {
  fxRate?: string;
  iibbPerceptionRate?: string;
  iibbPerceptionAmountOverride?: string | null;
};

/** D-008/D-112: a retry must preserve the original FX and document perception. */
function documentFinancialReplayMatches(
  existing: DocumentFinancialReplayExisting,
  input: DocumentFinancialReplayInput,
): boolean {
  const expectedFx = existing.currency === "ARS" ? "1" : input.fxRate;
  if (!expectedFx || serializeFxRateDecimal(existing.fxRate ?? "1") !== serializeFxRateDecimal(expectedFx)) return false;
  const rate = input.iibbPerceptionRate ?? DEFAULT_IIBB_PERCEPTION_RATE_PCT;
  if (serializeRatePctDecimal(existing.iibbPerceptionRate ?? DEFAULT_IIBB_PERCEPTION_RATE_PCT) !== serializeRatePctDecimal(rate)) return false;
  if (existing.subtotal && existing.iibbPerceptionAmount) {
    const expected = calcDocumentHeaderTaxTotals({
      subtotal: moneyFingerprint(existing.subtotal),
      taxAmount: "0",
      iibbPerceptionRatePercent: rate,
      iibbPerceptionAmountOverride: input.iibbPerceptionAmountOverride,
    }).iibbPerceptionAmount;
    if (moneyFingerprint(existing.iibbPerceptionAmount) !== expected) return false;
  } else if (input.iibbPerceptionAmountOverride != null) {
    return false;
  }
  return true;
}

export function registerApExpenseReplayMatches(
  existing: {
    status: string;
    supplierContactId: string;
    projectId: string | null;
    issueDate: Date;
    dueDate: Date;
    currency: string;
    fxRate?: { toString(): string };
    subtotal?: { toString(): string };
    iibbPerceptionRate?: { toString(): string };
    iibbPerceptionAmount?: { toString(): string };
    invoiceLetter: string | null;
    purchaseOrderId: string | null;
    createdAt: Date;
    payableId: string | null;
    lines: InvoiceLineReplayExisting[];
    payments: Array<SettlementReplayExisting & {
      payableId: string;
      accountId: string;
      paymentDate: Date;
      amount: { toString(): string };
      fxRate?: { toString(): string };
      idempotencyKey?: string | null;
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
    fxRate?: string;
    iibbPerceptionRate?: string;
    iibbPerceptionAmountOverride?: string | null;
    invoiceLetter?: string | null;
    purchaseOrderId?: string | null;
    pricesIncludeTax?: boolean;
    lines: InvoiceLineReplayInput[];
    payNow?: SettlementReplayInput & {
      accountId: string;
      paymentDate: string;
      payFullBalance?: boolean;
      amount?: string | null;
      fxRate?: string;
      idempotencyKey?: string;
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
  if (!documentFinancialReplayMatches(existing, input)) return false;
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
    fxRate?: { toString(): string };
    subtotal?: { toString(): string };
    iibbPerceptionRate?: { toString(): string };
    iibbPerceptionAmount?: { toString(): string };
    invoiceLetter: string | null;
    externalInvoiceRef: string | null;
    createdAt: Date;
    receivableId: string | null;
    lines: InvoiceLineReplayExisting[];
    collections: Array<SettlementReplayExisting & {
      receivableId: string;
      accountId: string;
      collectionDate: Date;
      amount: { toString(): string };
      fxRate?: { toString(): string };
      idempotencyKey?: string | null;
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
    fxRate?: string;
    iibbPerceptionRate?: string;
    iibbPerceptionAmountOverride?: string | null;
    invoiceLetter?: string | null;
    externalInvoiceRef?: string | null;
    pricesIncludeTax?: boolean;
    lines: InvoiceLineReplayInput[];
    collectNow?: SettlementReplayInput & {
      accountId: string;
      collectionDate: string;
      collectFullBalance?: boolean;
      amount?: string | null;
      fxRate?: string;
      idempotencyKey?: string;
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
  if (!documentFinancialReplayMatches(existing, input)) return false;
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

function linesFingerprint(
  lines: Array<{ purchaseOrderLineId: string; quantityReceived: { toString(): string } | string; notes?: string | null }>,
): string {
  return JSON.stringify(lines
    .map((line) => JSON.stringify([line.purchaseOrderLineId, qtyFingerprint(line.quantityReceived), line.notes ?? null]))
    .sort());
}

export function purchaseReceiptReplayMatches(
  existing: {
    purchaseOrderId: string;
    warehouseId: string | null;
    receiptDate: Date;
    notes: string | null;
    lines: Array<{ purchaseOrderLineId: string; quantityReceived: { toString(): string }; notes?: string | null }>;
  },
  input: {
    purchaseOrderId: string;
    warehouseId?: string | null;
    receiptDate: string;
    notes?: string | null;
    lines: Array<{ purchaseOrderLineId: string; quantityReceived: string; notes?: string | null }>;
  },
): boolean {
  if (existing.purchaseOrderId !== input.purchaseOrderId) return false;
  if ((existing.warehouseId ?? null) !== (input.warehouseId ?? null)) return false;
  if (dateOnlyFingerprint(existing.receiptDate) !== input.receiptDate) return false;
  if ((existing.notes ?? null) !== (input.notes ?? null)) return false;
  return linesFingerprint(existing.lines) === linesFingerprint(input.lines);
}

function nullableStr(v: string | null | undefined): string {
  return v ?? "";
}

export function jobsiteLogReplayMatches(
  existing: {
    projectId: string;
    companyId: string;
    logDate: Date;
    title: string | null;
    workFront: string | null;
    shift: string | null;
    weather: string | null;
    generalNotes: string | null;
    blockers: string | null;
    incidents: string | null;
    safetyNotes: string | null;
    progress: Array<{
      wbsNodeId: string;
      quantityCompleted: { toString(): string };
      physicalPct: { toString(): string } | null;
    }>;
    labor: Array<{
      contactId: string | null;
      subcontractId: string | null;
      workersCount: number;
      hoursWorked: { toString(): string } | null;
    }>;
    materials: Array<{
      productId: string | null;
      warehouseId: string | null;
      quantity: { toString(): string };
    }>;
    issues: Array<{ type: string; severity: string; description: string }>;
  },
  input: {
    projectId: string;
    companyId?: string | null;
    logDate: string;
    title?: string | null;
    workFront?: string | null;
    shift?: string | null;
    weather?: string | null;
    generalNotes?: string | null;
    blockers?: string | null;
    incidents?: string | null;
    safetyNotes?: string | null;
    progress?: Array<{
      wbsNodeId: string;
      quantityCompleted: string;
      physicalPct?: string | null;
    }>;
    labor?: Array<{
      contactId?: string | null;
      subcontractId?: string | null;
      workersCount?: number;
      hoursWorked?: string | null;
    }>;
    materials?: Array<{
      productId?: string | null;
      warehouseId?: string | null;
      quantity: string;
    }>;
    issues?: Array<{ type: string; severity: string; description: string }>;
  },
): boolean {
  if (existing.projectId !== input.projectId) return false;
  if (existing.companyId !== (input.companyId ?? "")) return false;
  if (dateOnlyFingerprint(existing.logDate) !== input.logDate) return false;
  if (nullableStr(existing.title) !== nullableStr(input.title)) return false;
  if (nullableStr(existing.workFront) !== nullableStr(input.workFront)) return false;
  if (nullableStr(existing.shift) !== nullableStr(input.shift)) return false;
  if (nullableStr(existing.weather) !== nullableStr(input.weather)) return false;
  if ((normalizeRichNote(existing.generalNotes) ?? "") !== (normalizeRichNote(input.generalNotes) ?? "")) return false;
  if (nullableStr(existing.blockers) !== nullableStr(input.blockers)) return false;
  if (nullableStr(existing.incidents) !== nullableStr(input.incidents)) return false;
  if (nullableStr(existing.safetyNotes) !== nullableStr(input.safetyNotes)) return false;

  const progressFp = (rows: typeof existing.progress | NonNullable<typeof input.progress>) =>
    [...rows]
      .map((r) => {
        const pct =
          "physicalPct" in r && r.physicalPct != null && r.physicalPct !== ""
            ? typeof r.physicalPct === "string"
              ? r.physicalPct
              : r.physicalPct.toString()
            : "";
        return `${r.wbsNodeId}:${qtyFingerprint(r.quantityCompleted)}:${pct}`;
      })
      .sort()
      .join("|");
  if (progressFp(existing.progress) !== progressFp(input.progress ?? [])) return false;

  const laborFp = (
    rows: typeof existing.labor | NonNullable<typeof input.labor>,
  ) =>
    [...rows]
      .map((r) => {
        const hours =
          "hoursWorked" in r && r.hoursWorked != null && r.hoursWorked !== ""
            ? typeof r.hoursWorked === "string"
              ? r.hoursWorked
              : r.hoursWorked.toString()
            : "";
        const workers = "workersCount" in r && r.workersCount != null ? r.workersCount : 0;
        return `${r.contactId ?? ""}:${r.subcontractId ?? ""}:${workers}:${hours}`;
      })
      .sort()
      .join("|");
  if (laborFp(existing.labor) !== laborFp(input.labor ?? [])) return false;

  const materialsFp = (
    rows: typeof existing.materials | NonNullable<typeof input.materials>,
  ) =>
    [...rows]
      .map((r) => `${r.productId ?? ""}:${r.warehouseId ?? ""}:${qtyFingerprint(r.quantity)}`)
      .sort()
      .join("|");
  if (materialsFp(existing.materials) !== materialsFp(input.materials ?? [])) return false;

  const issuesFp = (rows: typeof existing.issues | NonNullable<typeof input.issues>) =>
    [...rows].map((r) => `${r.type}:${r.severity}:${r.description}`).sort().join("|");
  return issuesFp(existing.issues) === issuesFp(input.issues ?? []);
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
