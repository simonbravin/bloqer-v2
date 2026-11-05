import { Prisma, prisma } from "@bloqer/database";
import type { JournalEntry, JournalEntryLine, JournalEntrySourceType } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type {
  CreateJournalEntryInput,
  JournalLineInput,
  ListAccountLedgerInput,
  ListJournalEntriesInput,
  UpdateJournalEntryInput,
} from "@bloqer/validators";
import { serializeMoneyDecimal, toMoneyDecimal } from "../finance/money-decimal";
import { resolvePagination } from "../finance/pagination";
import { log } from "../audit/audit.service";
import { isCrossCompany } from "../company-scope";
import { assertAccountingTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { lockAccountingCompany, resolveAccountingCompanyId } from "./accounting-company-context";
import {
  applyNaturalRunningBalance,
  naturalBalance,
  naturalBalanceSignedString,
} from "./accounting-natural-balance";
import { entryDateGte, entryDateLte, sanitizeIsoDate } from "./accounting-date";
import { assertOptimisticRowUpdate } from "../finance/optimistic-lock";
import { assertFinancialPeriodOpen } from "../finance/period-lock.service";
import { toIsoDateInTimeZone } from "@bloqer/utils";
import { loadTreasuryJournalMovement, loadTreasuryJournalTransfer } from "./accounting-treasury-source";

/** Sourced journals mirror an operational document [D-063]. */
export function isSourcedJournalEntry(entry: {
  sourceType: JournalEntrySourceType;
  sourceId: string | null;
}): boolean {
  return entry.sourceType !== "MANUAL" && entry.sourceId != null;
}

const AR_AP_JOURNAL_SOURCES = new Set<JournalEntrySourceType>([
  "PAYMENT", "COLLECTION", "SALES_INVOICE", "SALES_CREDIT_NOTE", "SALES_DEBIT_NOTE",
  "SUPPLIER_INVOICE", "SUPPLIER_CREDIT_NOTE", "SUPPLIER_DEBIT_NOTE",
]);

/** D-061/D-063: an operational cancellation cannot leave a new/postable AR/AP journal. */
export async function assertArApJournalSourceCurrent(
  tx: Prisma.TransactionClient,
  entry: Pick<JournalEntry, "tenantId" | "companyId" | "sourceType" | "sourceId">,
): Promise<{ amount: Prisma.Decimal; currency: string; projectId: string | null } | undefined> {
  if (!entry.sourceId || !AR_AP_JOURNAL_SOURCES.has(entry.sourceType)) return;
  const where = { id: entry.sourceId, tenantId: entry.tenantId, companyId: entry.companyId };
  if (entry.sourceType === "PAYMENT") {
    const source = await tx.payment.findFirst({ where, select: { status: true, amount: true, currency: true, projectId: true } });
    if (source?.status === "CONFIRMED") return source;
  } else if (entry.sourceType === "COLLECTION") {
    const source = await tx.collection.findFirst({ where, select: { status: true, amount: true, currency: true, projectId: true } });
    if (source?.status === "CONFIRMED") return source;
  } else {
    const expectedKind = entry.sourceType.endsWith("CREDIT_NOTE") ? "CREDIT_NOTE"
      : entry.sourceType.endsWith("DEBIT_NOTE") ? "DEBIT_NOTE" : "INVOICE";
    const select = { status: true, documentKind: true, totalAmount: true, currency: true, projectId: true } as const;
    const source = entry.sourceType.startsWith("SUPPLIER_")
      ? await tx.supplierInvoice.findFirst({ where, select })
      : await tx.salesInvoice.findFirst({ where, select });
    if (source?.status === "ISSUED" && source.documentKind === expectedKind) {
      return { amount: source.totalAmount, currency: source.currency, projectId: source.projectId };
    }
  }
  throw new ServiceError("CONFLICT", "El origen operativo ya no permite crear o contabilizar este asiento. Revisá su estado.");
}

function assertJournalMatchesOrigin(
  source: { amount: Prisma.Decimal; currency: string; projectId: string | null },
  journal: { projectId: string | null; lines: ParsedJournalLine[] },
) {
  const debitTotal = journal.lines.reduce((total, line) => total.plus(line.debit), new Prisma.Decimal(0));
  const sourceCurrency = normalizeJournalCurrency(source.currency);
  if (journal.projectId !== source.projectId || !toMoneyDecimal(debitTotal).equals(toMoneyDecimal(source.amount)) ||
      journal.lines.some(line => normalizeJournalCurrency(line.currency) !== sourceCurrency)) {
    throw new ServiceError("CONFLICT", "El monto, la moneda o la obra del asiento no coinciden con su origen operativo");
  }
}

/** D-061: a cash origin must still exist and be eligible while Company is locked. */
export async function assertJournalOperationalSourceCurrent(
  tx: Prisma.TransactionClient,
  entry: Pick<JournalEntry, "tenantId" | "companyId" | "sourceType" | "sourceId" | "projectId"> & { lines: ParsedJournalLine[] },
): Promise<void> {
  if (!entry.sourceId) return;
  const { tenantId, companyId, sourceType, sourceId } = entry;
  const arApSource = await assertArApJournalSourceCurrent(tx, entry);
  if (arApSource) {
    assertJournalMatchesOrigin(arApSource, entry);
    return;
  }
  if (sourceType === "INTERNAL_TRANSFER") {
    const source = await loadTreasuryJournalTransfer(tx, tenantId, sourceId);
    if (source?.transfer.companyId === companyId) {
      assertJournalMatchesOrigin({ ...source.transfer, projectId: null }, entry);
      return;
    }
  } else if (sourceType === "TREASURY_INFLOW" || sourceType === "TREASURY_OUTFLOW" || sourceType === "ADJUSTMENT") {
    const movement = await loadTreasuryJournalMovement(tx, tenantId, sourceId);
    const expectedType = sourceType === "TREASURY_INFLOW" ? "INFLOW" : sourceType === "TREASURY_OUTFLOW" ? "OUTFLOW" : null;
    if (movement && (movement.companyId ?? movement.account.companyId) === companyId &&
        (expectedType ? movement.type === expectedType : movement.sourceType === "MANUAL_ADJUSTMENT")) {
      assertJournalMatchesOrigin({ ...movement, projectId: null }, entry);
      return;
    }
  } else return;
  throw new ServiceError("CONFLICT", "El origen de tesorería ya no permite crear o contabilizar este asiento. Revisá su estado y empresa.");
}

const journalWriteOptions = { maxWait: 10_000, timeout: 30_000 };
export const MAX_ACCOUNT_LEDGER_ROWS = 5_000;

function parseJournalDate(raw: string): Date {
  const date = sanitizeIsoDate(raw);
  if (!date) throw new ServiceError("VALIDATION", "La fecha del asiento no es válida");
  return entryDateGte(date);
}

/**
 * Sourced DRAFT lines: structure + money/currency immutable; accounts/descriptions may change [D-063].
 * Pure helper for unit tests + `updateJournalEntry`.
 */
export function assertSourcedLineMoneyUnchanged(
  existing: Array<{ debit: Prisma.Decimal | string; credit: Prisma.Decimal | string; currency: string }>,
  incoming: ParsedJournalLine[],
): void {
  if (existing.length !== incoming.length) {
    throw new ServiceError(
      "VALIDATION",
      "No se puede cambiar la estructura de un asiento con origen operativo",
    );
  }
  for (let i = 0; i < existing.length; i++) {
    const ex = existing[i]!;
    const nw = incoming[i]!;
    const exDebit = serializeMoneyDecimal(ex.debit);
    const exCredit = serializeMoneyDecimal(ex.credit);
    const nwDebit = serializeMoneyDecimal(nw.debit);
    const nwCredit = serializeMoneyDecimal(nw.credit);
    if (exDebit !== nwDebit || exCredit !== nwCredit || normalizeJournalCurrency(ex.currency) !== normalizeJournalCurrency(nw.currency)) {
      throw new ServiceError(
        "VALIDATION",
        "Los montos y la moneda de un asiento con origen operativo no se pueden editar",
      );
    }
  }
}

export type JournalEntryLineView = Omit<JournalEntryLine, "debit" | "credit"> & {
  debit:  string;
  credit: string;
};

/** Serialized journal entry for services/UI — scalar fields + computed lines (no Prisma `Decimal` on lines). */
export type JournalEntryView = Pick<
  JournalEntry,
  | "id"
  | "tenantId"
  | "companyId"
  | "projectId"
  | "entryDate"
  | "status"
  | "sourceType"
  | "sourceId"
  | "description"
  | "reference"
  | "reversesEntryId"
  | "createdByUserId"
  | "updatedByUserId"
  | "postedAt"
  | "cancelledAt"
  | "createdAt"
  | "updatedAt"
> & {
  lines: (JournalEntryLineView & { accountCode: string; accountName: string })[];
  reversedByEntryId: string | null;
};

export type AccountLedgerRowView = {
  id:             string;
  entryId:        string;
  entryDate:      string;
  entryReference: string | null;
  entryDescription: string;
  lineDescription: string | null;
  debit:          string;
  credit:         string;
  currency:       string;
  runningBalance: string;
  /** Synthetic opening-balance row when a dateFrom filter is applied [D-062]. */
  isOpening?:     boolean;
};

export type AccountLedgerResult = {
  rows: AccountLedgerRowView[];
  truncated: boolean;
  dateFrom: string | null;
  dateTo: string | null;
};

export type TrialBalanceRowView = {
  accountId:   string;
  accountCode: string;
  accountName: string;
  accountType: string;
  currency:    string;
  debit:       string;
  credit:      string;
  /** Natural balance by AccountType [D-062]. */
  balance:     string;
};

async function assertView(ctx: ServiceContext): Promise<void> {
  await assertAccountingTenantModule(ctx);
  if (!can(ctx.roles, "VIEW", "ACCOUNTING")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver contabilidad");
  }
}

async function assertEdit(ctx: ServiceContext): Promise<void> {
  await assertAccountingTenantModule(ctx);
  if (!can(ctx.roles, "EDIT", "ACCOUNTING")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar contabilidad");
  }
}

export interface ParsedJournalLine {
  accountId:   string;
  projectId:   string | null;
  description: string | null;
  debit:       Prisma.Decimal;
  credit:      Prisma.Decimal;
  currency:    string;
}

export function normalizeJournalCurrency(currency: string): string {
  return currency.trim().toUpperCase();
}

function parseJournalMoney(value: string): Prisma.Decimal {
  if (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value)) {
    throw new ServiceError("VALIDATION", "Monto contable inválido");
  }
  const amount = toMoneyDecimal(value);
  // Prisma Decimal(18,4) reserves fourteen integer digits.
  if (amount.greaterThanOrEqualTo("100000000000000")) {
    throw new ServiceError("VALIDATION", "El monto supera el máximo admitido por línea");
  }
  return amount;
}

/** At least 2 lines; each line exactly one of debit/credit &gt; 0; balanced per currency. */
export function assertBalancedJournalEntry(lines: ParsedJournalLine[]): void {
  if (lines.length < 2) {
    throw new ServiceError("VALIDATION", "El asiento debe tener al menos dos líneas");
  }
  const totals = new Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>();
  for (const line of lines) {
    if (!line.debit.isFinite() || !line.credit.isFinite() || line.debit.lessThan(0) || line.credit.lessThan(0)) {
      throw new ServiceError("VALIDATION", "El debe y el haber deben ser montos no negativos");
    }
    const dz = line.debit.equals(0);
    const cz = line.credit.equals(0);
    if (dz && cz) {
      throw new ServiceError("VALIDATION", "Cada línea debe tener debe o haber mayor a cero");
    }
    if (!dz && !cz) {
      throw new ServiceError("VALIDATION", "Cada línea solo puede registrar debe o haber, no ambos");
    }
    const cur = normalizeJournalCurrency(line.currency);
    if (cur.length < 1 || cur.length > 8) throw new ServiceError("VALIDATION", "Moneda inválida");
    if (!totals.has(cur)) totals.set(cur, { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(0) });
    const t = totals.get(cur)!;
    t.debit = t.debit.plus(line.debit);
    t.credit = t.credit.plus(line.credit);
  }
  for (const [, t] of totals) {
    if (!t.debit.equals(t.credit)) {
      throw new ServiceError("VALIDATION", "El asiento no está balanceado (debe = haber por moneda)");
    }
  }
}

export function parseJournalLinesFromInput(lines: JournalLineInput[]): ParsedJournalLine[] {
  return lines.map((l) => ({
    accountId:   l.accountId,
    projectId:   l.projectId ?? null,
    description: l.description?.trim() ?? null,
    debit:       parseJournalMoney(l.debit ?? "0"),
    credit:      parseJournalMoney(l.credit ?? "0"),
    currency:    normalizeJournalCurrency(l.currency),
  }));
}

const journalProjectScopeSelect = { tenantId: true, companyId: true } as const;
export const journalReversalSelect = { id: true, tenantId: true, companyId: true, status: true, reversesEntryId: true } as const;
type JournalReversal = Pick<JournalEntry, keyof typeof journalReversalSelect>;

export function isValidJournalReversal(
  original: Pick<JournalEntry, "id" | "tenantId" | "companyId" | "status">,
  reverse: JournalReversal | null | undefined,
): reverse is JournalReversal {
  return Boolean(reverse && original.status === "POSTED" && reverse.status === "POSTED" && reverse.id !== original.id &&
    reverse.tenantId === original.tenantId && reverse.companyId === original.companyId && reverse.reversesEntryId === original.id);
}

const journalViewRelations = {
  project: { select: journalProjectScopeSelect },
  reversesEntry: { select: journalReversalSelect },
  lines: {
    include: {
      account: { select: { tenantId: true, companyId: true, code: true, name: true } },
      project: { select: journalProjectScopeSelect },
    },
    orderBy: { id: "asc" },
  },
} as const satisfies Prisma.JournalEntryInclude;

type JournalViewRow = Prisma.JournalEntryGetPayload<{ include: typeof journalViewRelations }> & {
  reversedByEntry?: JournalReversal | null;
};

function assertJournalViewScope(entry: JournalViewRow): void {
  const { tenantId, companyId } = entry;
  function projectMatches(projectId: string | null, project: { tenantId: string; companyId: string | null } | null) {
    return !projectId || (project && project.tenantId === tenantId && (project.companyId === null || project.companyId === companyId));
  }
  if (!projectMatches(entry.projectId, entry.project) || entry.lines.some(line =>
    line.account.tenantId !== tenantId || line.account.companyId !== companyId || !projectMatches(line.projectId, line.project))) {
    throw new ServiceError("CONFLICT", "El asiento contiene cuentas u obras fuera de su ámbito");
  }
}

function serializeLine(line: JournalViewRow["lines"][number]): JournalEntryView["lines"][number] {
  return {
    id:          line.id,
    journalEntryId: line.journalEntryId,
    accountId:   line.accountId,
    projectId:   line.projectId,
    description: line.description,
    debit:       serializeMoneyDecimal(line.debit),
    credit:      serializeMoneyDecimal(line.credit),
    currency:    normalizeJournalCurrency(line.currency),
    createdAt:   line.createdAt,
    updatedAt:   line.updatedAt,
    accountCode: line.account.code,
    accountName: line.account.name,
  };
}

function toJournalEntryView(entry: JournalViewRow): JournalEntryView {
  assertJournalViewScope(entry);
  const { reversedByEntry, reversesEntry } = entry;
  const validOriginal = reversesEntry && reversesEntry.id === entry.reversesEntryId && isValidJournalReversal(reversesEntry, entry);
  const invalidReversalLink = Boolean(entry.reversesEntryId && !validOriginal);
  return {
    id: entry.id,
    tenantId: entry.tenantId,
    companyId: entry.companyId,
    projectId: entry.projectId,
    entryDate: entry.entryDate,
    status: entry.status,
    sourceType: entry.sourceType,
    sourceId: invalidReversalLink ? null : entry.sourceId,
    description: entry.description,
    reference: entry.reference,
    reversesEntryId: invalidReversalLink ? null : entry.reversesEntryId,
    createdByUserId: entry.createdByUserId,
    updatedByUserId: entry.updatedByUserId,
    postedAt: entry.postedAt,
    cancelledAt: entry.cancelledAt,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    reversedByEntryId: isValidJournalReversal(entry, reversedByEntry) ? reversedByEntry.id : null,
    lines: entry.lines.map(serializeLine),
  };
}

async function loadJournalEntryView(
  id: string,
  tenantId: string,
  companyId: string,
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<JournalEntryView> {
  const entry = await db.journalEntry.findFirst({
    where: { id, tenantId, companyId },
    include: {
      ...journalViewRelations,
      reversedByEntry: { select: journalReversalSelect },
    },
  });
  if (!entry) throw new ServiceError("NOT_FOUND", "Asiento no encontrado");
  return toJournalEntryView(entry);
}

/**
 * Lookup without RBAC/module gates — used by soft automation (ensureDraftJournal*).
 * Callers must already trust tenantId/companyId from the operational document.
 */
export async function lookupNonCancelledJournalEntryIdBySource(
  ctx: ServiceContext,
  params: { companyId: string; sourceType: JournalEntrySourceType; sourceId: string },
): Promise<string | null> {
  const row = await prisma.journalEntry.findFirst({
    where: {
      tenantId:   ctx.tenantId,
      companyId:  params.companyId,
      sourceType: params.sourceType,
      sourceId:   params.sourceId,
      status:     { not: "CANCELLED" },
    },
    select:    { id: true },
    orderBy:   [{ createdAt: "asc" }, { id: "asc" }],
  });
  return row?.id ?? null;
}

/**
 * First non-cancelled journal for the same operational source (duplicate draft/posted guard).
 * Enforces tenant module ACCOUNTING (direct callers cannot bypass disabled module).
 */
export async function findNonCancelledJournalEntryIdBySource(
  ctx: ServiceContext,
  params: { companyId: string; sourceType: JournalEntrySourceType; sourceId: string },
): Promise<string | null> {
  await assertAccountingTenantModule(ctx);
  if (isCrossCompany(params.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "El asiento pertenece a otra empresa");
  }
  return lookupNonCancelledJournalEntryIdBySource(ctx, params);
}

/** Load journal without VIEW ACCOUNTING — automation / cancel-sync only. */
export async function getJournalEntryByIdUnchecked(
  id: string,
  tenantId: string,
  companyId: string,
): Promise<JournalEntryView> {
  return loadJournalEntryView(id, tenantId, companyId);
}

async function validateAccountsAndProjects(
  companyId: string,
  tenantId: string,
  lines: ParsedJournalLine[],
  headerProjectId: string | null,
  db: Prisma.TransactionClient,
): Promise<void> {
  const accountIds = [...new Set(lines.map((l) => l.accountId))];
  if (accountIds.length > 0) {
    const accounts = await db.accountingAccount.findMany({
      where: { id: { in: accountIds }, tenantId, companyId, isActive: true },
      select: { id: true },
    });
    if (accounts.length !== accountIds.length) {
      throw new ServiceError(
        "VALIDATION",
        "Una o más cuentas contables no existen, están inactivas o no pertenecen a la empresa",
      );
    }
  }

  const projectIds = new Set<string>();
  if (headerProjectId) projectIds.add(headerProjectId);
  for (const l of lines) {
    if (l.projectId) projectIds.add(l.projectId);
  }
  if (projectIds.size > 0) {
    const projects = await db.project.findMany({
      where: { id: { in: [...projectIds] }, tenantId },
    });
    if (projects.length !== projectIds.size) {
      throw new ServiceError("VALIDATION", "Proyecto inválido");
    }
    for (const p of projects) {
      if (p.companyId !== null && p.companyId !== companyId) {
        throw new ServiceError("VALIDATION", "El proyecto no pertenece a la misma empresa que el asiento");
      }
    }
  }
}

export async function listJournalEntries(
  ctx: ServiceContext,
  filters: ListJournalEntriesInput,
): Promise<{ data: JournalEntryView[]; total: number }> {
  await assertView(ctx);
  const companyId = await resolveAccountingCompanyId(ctx, filters.companyId ?? null);
  const fromDate = sanitizeIsoDate(filters.fromDate);
  const toDate = sanitizeIsoDate(filters.toDate);
  if (fromDate && toDate && fromDate > toDate) {
    throw new ServiceError("VALIDATION", "La fecha desde no puede ser posterior a la fecha hasta.");
  }

  const where: Prisma.JournalEntryWhereInput = {
    tenantId:  ctx.tenantId,
    companyId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(fromDate || toDate
      ? {
          entryDate: {
            ...(fromDate ? { gte: entryDateGte(fromDate) } : {}),
            ...(toDate ? { lte: entryDateLte(toDate) } : {}),
          },
        }
      : {}),
  };

  const { skip, take } = resolvePagination(filters);

  const [rows, total] = await Promise.all([
    prisma.journalEntry.findMany({
      where,
      orderBy: [{ entryDate: "desc" }, { id: "desc" }],
      skip,
      take,
      include: journalViewRelations,
    }),
    prisma.journalEntry.count({ where }),
  ]);

  const data = rows.map(toJournalEntryView);

  return { data, total };
}

export async function getJournalEntryById(
  id: string,
  ctx: ServiceContext,
  opts?: { companyId?: string | null },
): Promise<JournalEntryView> {
  await assertView(ctx);
  const companyId = await resolveAccountingCompanyId(ctx, opts?.companyId ?? null);
  return loadJournalEntryView(id, ctx.tenantId, companyId);
}

/** Used by suggestion services: return existing journal (DRAFT or POSTED) instead of creating a duplicate. */
export async function getJournalEntryBySourceIfNotCancelled(
  ctx: ServiceContext,
  params: { companyId: string; sourceType: JournalEntrySourceType; sourceId: string },
): Promise<JournalEntryView | null> {
  await assertEdit(ctx);
  const id = await findNonCancelledJournalEntryIdBySource(ctx, params);
  if (!id) return null;
  return getJournalEntryById(id, ctx, { companyId: params.companyId });
}

async function loadOpeningBalancesByCurrency(
  ctx: ServiceContext,
  companyId: string,
  accountId: string,
  accountType: string,
  beforeDate: string,
  db: Prisma.TransactionClient,
): Promise<Map<string, Prisma.Decimal>> {
  const prior = await db.journalEntryLine.findMany({
    where: {
      accountId,
      journalEntry: {
        tenantId: ctx.tenantId,
        companyId,
        status: "POSTED",
        entryDate: { lt: entryDateGte(beforeDate) },
      },
    },
    select: { currency: true, debit: true, credit: true },
  });
  const map = new Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>();
  for (const l of prior) {
    const currency = normalizeJournalCurrency(l.currency);
    const cur = map.get(currency);
    if (!cur) map.set(currency, { debit: l.debit, credit: l.credit });
    else {
      cur.debit = cur.debit.plus(l.debit);
      cur.credit = cur.credit.plus(l.credit);
    }
  }
  const out = new Map<string, Prisma.Decimal>();
  for (const [currency, agg] of map) {
    out.set(currency, naturalBalance(accountType, agg.debit, agg.credit));
  }
  return out;
}

export async function getAccountLedger(
  ctx: ServiceContext,
  input: ListAccountLedgerInput,
): Promise<AccountLedgerResult> {
  await assertView(ctx);
  const companyId = await resolveAccountingCompanyId(ctx, input.companyId ?? null);

  const account = await prisma.accountingAccount.findFirst({
    where: { id: input.accountId, tenantId: ctx.tenantId, companyId },
  });
  if (!account) throw new ServiceError("NOT_FOUND", "Cuenta contable no encontrada");

  const dateFrom = sanitizeIsoDate(input.dateFrom) ?? null;
  const dateTo = sanitizeIsoDate(input.dateTo) ?? null;
  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new ServiceError(
      "VALIDATION",
      "La fecha desde no puede ser posterior a la fecha hasta.",
    );
  }

  const entryDateFilter: Prisma.DateTimeFilter = {};
  if (dateFrom) entryDateFilter.gte = entryDateGte(dateFrom);
  if (dateTo) entryDateFilter.lte = entryDateLte(dateTo);

  const limit = Number.isSafeInteger(input.limit) ? Math.max(1, Math.min(MAX_ACCOUNT_LEDGER_ROWS, input.limit!)) : 200;
  const { lines, byCurrency } = await prisma.$transaction(async (tx) => {
    const lines = await tx.journalEntryLine.findMany({
      where: {
        accountId: input.accountId,
        journalEntry: {
          tenantId: ctx.tenantId,
          companyId,
          status: "POSTED",
          ...(Object.keys(entryDateFilter).length > 0 ? { entryDate: entryDateFilter } : {}),
        },
      },
      include: { journalEntry: true },
      orderBy: [{ journalEntry: { entryDate: "asc" } }, { journalEntry: { id: "asc" } }, { id: "asc" }],
      take: limit + 1,
    });
    const byCurrency = dateFrom
      ? await loadOpeningBalancesByCurrency(ctx, companyId, account.id, account.type, dateFrom, tx)
      : new Map<string, Prisma.Decimal>();
    return { lines, byCurrency };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000 });
  const truncated = lines.length > limit;
  const slice = truncated ? lines.slice(0, limit) : lines;

  const openingRows: AccountLedgerRowView[] = [];
  if (dateFrom) {
    for (const currency of [...byCurrency.keys()].sort()) {
      const bal = byCurrency.get(currency)!;
      if (bal.isZero()) continue;
      openingRows.push({
        id: `opening-${currency}`,
        entryId: "",
        entryDate: dateFrom,
        entryReference: null,
        entryDescription: "Saldo inicial",
        lineDescription: null,
        debit: serializeMoneyDecimal(0),
        credit: serializeMoneyDecimal(0),
        currency,
        runningBalance: serializeMoneyDecimal(bal),
        isOpening: true,
      });
    }
  }

  const movementRows = slice.map((l) => {
    const cur = normalizeJournalCurrency(l.currency);
    const prev = byCurrency.get(cur) ?? new Prisma.Decimal(0);
    const next = applyNaturalRunningBalance(account.type, prev, l.debit, l.credit);
    byCurrency.set(cur, next);
    return {
      id:               l.id,
      entryId:          l.journalEntryId,
      entryDate:        l.journalEntry.entryDate.toISOString().slice(0, 10),
      entryReference:   l.journalEntry.reference,
      entryDescription: l.journalEntry.description,
      lineDescription:  l.description,
      debit:            serializeMoneyDecimal(l.debit),
      credit:           serializeMoneyDecimal(l.credit),
      currency:         l.currency,
      runningBalance:   serializeMoneyDecimal(next),
    };
  });

  return {
    rows: [...openingRows, ...movementRows],
    truncated,
    dateFrom,
    dateTo,
  };
}

async function persistJournalEntryCreate(
  input: CreateJournalEntryInput,
  ctx: ServiceContext,
  companyId: string,
): Promise<{ entry: JournalEntryView; created: boolean }> {
  const parsed = parseJournalLinesFromInput(input.lines);
  assertBalancedJournalEntry(parsed);
  const description = input.description.trim();
  if (!description) throw new ServiceError("VALIDATION", "Completá la descripción del asiento");
  const headerProjectId = input.projectId ?? null;
  const entryDate = parseJournalDate(input.entryDate);
  const sourceType = input.sourceType ?? "MANUAL";
  const sourceId = input.sourceId ?? null;

  try {
    const saved = await prisma.$transaction(async (tx) => {
      await lockAccountingCompany(tx, ctx.tenantId, companyId);
      await assertJournalOperationalSourceCurrent(tx, { tenantId: ctx.tenantId, companyId, sourceType, sourceId, projectId: headerProjectId, lines: parsed });
      if (sourceId) {
        if (sourceType === "INTERNAL_TRANSFER") {
          const legacy = await tx.journalEntry.findFirst({
            where: { tenantId: ctx.tenantId, companyId: { not: companyId }, sourceType, sourceId, status: { not: "CANCELLED" } },
            select: { id: true },
          });
          if (legacy) throw new ServiceError("CONFLICT", "La transferencia ya tiene un asiento en otra empresa. Revisá el asiento existente.");
        }
        const existing = await tx.journalEntry.findFirst({
          where: {
            tenantId: ctx.tenantId,
            companyId,
            sourceType,
            sourceId,
            status: { not: "CANCELLED" },
          },
          select: { id: true },
        });
        if (existing) {
          const row = await tx.journalEntry.findFirstOrThrow({
            where: { id: existing.id },
            include: journalViewRelations,
          });
          return { entry: toJournalEntryView(row), created: false };
        }
      }
      await assertFinancialPeriodOpen({ tenantId: ctx.tenantId, companyId, date: entryDate }, tx);
      await validateAccountsAndProjects(companyId, ctx.tenantId, parsed, headerProjectId, tx);
      const row = await tx.journalEntry.create({
        data: {
          tenantId:        ctx.tenantId,
          companyId,
          projectId:       headerProjectId,
          entryDate,
          status:          "DRAFT",
          sourceType,
          sourceId,
          description,
          reference:       input.reference?.trim() ?? null,
          createdByUserId: ctx.actorUserId,
          updatedByUserId: ctx.actorUserId,
          lines: {
            create: parsed.map((l) => ({
              accountId:   l.accountId,
              projectId:   l.projectId,
              description: l.description,
              debit:       l.debit,
              credit:      l.credit,
              currency:    l.currency,
            })),
          },
        },
        include: journalViewRelations,
      });
      await log({
        tenantId:    ctx.tenantId,
        actorUserId: ctx.actorUserId,
        action:      "journal_entry.created",
        entityType:  "JournalEntry",
        entityId:    row.id,
        after:       {
          status: row.status,
          sourceType: row.sourceType,
          sourceId: row.sourceId,
          lineCount: row.lines.length,
        },
        ipAddress:   ctx.ipAddress,
      }, tx);
      return { entry: toJournalEntryView(row), created: true };
    }, journalWriteOptions);

    return saved;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && sourceId) {
      const existingId = await lookupNonCancelledJournalEntryIdBySource(ctx, {
        companyId,
        sourceType,
        sourceId,
      });
      if (existingId) {
        return { entry: await loadJournalEntryView(existingId, ctx.tenantId, companyId), created: false };
      }
    }
    throw e;
  }
}

export async function createJournalEntry(
  input: CreateJournalEntryInput,
  ctx: ServiceContext,
): Promise<JournalEntryView> {
  await assertEdit(ctx);
  if ((input.sourceType && input.sourceType !== "MANUAL") || input.sourceId != null) {
    throw new ServiceError("VALIDATION", "Generá los asientos con origen desde el documento operativo");
  }
  const companyId = await resolveAccountingCompanyId(ctx, input.companyId ?? null);
  return (await persistJournalEntryCreate(input, ctx, companyId)).entry;
}

/**
 * Soft automation path: no EDIT ACCOUNTING / no first-company fallback.
 * `documentCompanyId` must come from the operational document.
 */
export async function createJournalEntryAsAutomation(
  input: CreateJournalEntryInput,
  ctx: ServiceContext,
  documentCompanyId: string,
): Promise<JournalEntryView> {
  return (await createOrGetJournalEntryAsAutomation(input, ctx, documentCompanyId)).entry;
}

export async function createOrGetJournalEntryAsAutomation(
  input: CreateJournalEntryInput,
  ctx: ServiceContext,
  documentCompanyId: string,
): Promise<{ entry: JournalEntryView; created: boolean }> {
  const company = await prisma.company.findFirst({
    where: { id: documentCompanyId, tenantId: ctx.tenantId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!company) {
    throw new ServiceError("VALIDATION", "Empresa del documento inválida o inactiva");
  }
  return persistJournalEntryCreate({ ...input, companyId: documentCompanyId }, ctx, documentCompanyId);
}

export async function updateJournalEntry(
  id: string,
  input: UpdateJournalEntryInput,
  ctx: ServiceContext,
): Promise<JournalEntryView> {
  await assertEdit(ctx);
  const existing = await prisma.journalEntry.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Asiento no encontrado");
  await resolveAccountingCompanyId(ctx, existing.companyId);
  if (isCrossCompany(existing.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "Asiento fuera del alcance de empresa");
  }
  if (existing.status !== "DRAFT") {
    throw new ServiceError("CONFLICT", "Solo se pueden editar borradores");
  }

  const companyId = await resolveAccountingCompanyId(ctx, input.companyId ?? existing.companyId);
  if (companyId !== existing.companyId) {
    throw new ServiceError("VALIDATION", "No se puede cambiar la empresa del asiento");
  }

  const requestedDate = input.entryDate === undefined ? null : parseJournalDate(input.entryDate);
  const description = input.description?.trim();
  if (description === "") throw new ServiceError("VALIDATION", "Completá la descripción del asiento");
  return prisma.$transaction(async (tx) => {
    await lockAccountingCompany(tx, ctx.tenantId, companyId);
    const fresh = await tx.journalEntry.findFirst({
      where: { id, tenantId: ctx.tenantId, companyId },
      include: { lines: { orderBy: { id: "asc" } } },
    });
    if (!fresh || fresh.status !== "DRAFT") {
      throw new ServiceError("CONFLICT", "El asiento ya no está en borrador. Recargá e intentá de nuevo.");
    }
    const entryDate = requestedDate ?? fresh.entryDate;
    await assertFinancialPeriodOpen({ tenantId: ctx.tenantId, companyId, date: fresh.entryDate }, tx);
    if (entryDate.getTime() !== fresh.entryDate.getTime()) {
      await assertFinancialPeriodOpen({ tenantId: ctx.tenantId, companyId, date: entryDate }, tx);
    }

    const sourced = isSourcedJournalEntry(fresh);
    const projectId = sourced || input.projectId === undefined ? fresh.projectId : input.projectId;
    const parsed = input.lines ? parseJournalLinesFromInput(input.lines) : null;
    if (parsed && sourced) assertSourcedLineMoneyUnchanged(fresh.lines, parsed);
    if (parsed && !sourced) assertBalancedJournalEntry(parsed);
    // Sourced line/project amounts are persisted unchanged even for legacy drafts.
    const linesToValidate = parsed?.map((line, i) => sourced ? { ...line, projectId: fresh.lines[i]!.projectId } : line) ?? [];
    await validateAccountsAndProjects(companyId, ctx.tenantId, linesToValidate, projectId, tx);

    const claimed = await tx.journalEntry.updateMany({
      where: { id, tenantId: ctx.tenantId, companyId, status: "DRAFT", updatedAt: fresh.updatedAt },
      data: {
        entryDate,
        description,
        reference: input.reference === undefined ? undefined : input.reference?.trim() ?? null,
        projectId,
        updatedByUserId: ctx.actorUserId,
      },
    });
    assertOptimisticRowUpdate(
      claimed.count,
      "El asiento ya no está en borrador. Recargá e intentá de nuevo.",
    );

    if (parsed) {
      if (sourced) {
        // In-place updates keep line ids/order stable (delete+create reshuffles UUID order).
        for (let i = 0; i < fresh.lines.length; i++) {
          const ex = fresh.lines[i]!;
          const nw = parsed[i]!;
          await tx.journalEntryLine.update({
            where: { id: ex.id },
            data: {
              accountId: nw.accountId,
              description: nw.description,
            },
          });
        }
      } else {
        await tx.journalEntryLine.deleteMany({ where: { journalEntryId: id } });
        await tx.journalEntryLine.createMany({
          data: parsed.map((l) => ({
            journalEntryId: id,
            accountId:      l.accountId,
            projectId:      l.projectId,
            description:    l.description,
            debit:          l.debit,
            credit:         l.credit,
            currency:       l.currency,
          })),
        });
      }
    }
    await log({
      tenantId:    ctx.tenantId,
      actorUserId: ctx.actorUserId,
      action:      "journal_entry.updated",
      entityType:  "JournalEntry",
      entityId:    id,
      after:       input,
      ipAddress:   ctx.ipAddress,
    }, tx);
    return loadJournalEntryView(id, ctx.tenantId, companyId, tx);
  }, journalWriteOptions);
}

export async function postJournalEntry(id: string, ctx: ServiceContext): Promise<JournalEntryView> {
  await assertEdit(ctx);
  const existing = await prisma.journalEntry.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Asiento no encontrado");
  await resolveAccountingCompanyId(ctx, existing.companyId);
  if (isCrossCompany(existing.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "Asiento fuera del alcance de empresa");
  }
  if (existing.status !== "DRAFT") {
    throw new ServiceError("CONFLICT", "Solo se pueden contabilizar borradores");
  }

  // Serialize vs period close: company row FOR UPDATE + re-check period inside the same txn.
  return prisma.$transaction(async (tx) => {
    await lockAccountingCompany(tx, ctx.tenantId, existing.companyId);
    const fresh = await tx.journalEntry.findFirst({ where: { id, tenantId: ctx.tenantId, companyId: existing.companyId }, include: { lines: true } });
    if (!fresh || fresh.status !== "DRAFT") throw new ServiceError("CONFLICT", "El asiento ya no está en borrador. Recargá e intentá de nuevo.");
    assertBalancedJournalEntry(fresh.lines);
    await assertJournalOperationalSourceCurrent(tx, fresh);
    await validateAccountsAndProjects(existing.companyId, ctx.tenantId, fresh.lines, fresh.projectId, tx);
    await assertFinancialPeriodOpen(
      {
        tenantId: ctx.tenantId,
        companyId: existing.companyId,
        date: fresh.entryDate,
      },
      tx,
    );

    const flipped = await tx.journalEntry.updateMany({
      where: { id, tenantId: ctx.tenantId, companyId: existing.companyId, status: "DRAFT", updatedAt: fresh.updatedAt },
      data: {
        status:          "POSTED",
        postedAt:        new Date(),
        updatedByUserId: ctx.actorUserId,
      },
    });
    assertOptimisticRowUpdate(
      flipped.count,
      "El asiento ya no está en borrador. Recargá e intentá de nuevo.",
    );

    await log(
      {
        tenantId:    ctx.tenantId,
        actorUserId: ctx.actorUserId,
        action:      "journal_entry.posted",
        entityType:  "JournalEntry",
        entityId:    id,
        after:       { status: "POSTED" },
        ipAddress:   ctx.ipAddress,
      },
      tx,
    );
    return loadJournalEntryView(id, ctx.tenantId, existing.companyId, tx);
  }, journalWriteOptions);
}

async function cancelDraftJournalEntryCore(
  id: string,
  ctx: ServiceContext,
  existing: JournalEntry,
  opts?: { operationalSync?: boolean; tx?: Prisma.TransactionClient },
): Promise<JournalEntryView> {
  if (existing.status !== "DRAFT") {
    throw new ServiceError("CONFLICT", "Solo se pueden anular borradores");
  }

  // D-135: a sourced DRAFT's own accounting date remains protected during origin cancellation.
  const cancel = async (tx: Prisma.TransactionClient): Promise<JournalEntryView> => {
    await lockAccountingCompany(tx, ctx.tenantId, existing.companyId);
    const fresh = await tx.journalEntry.findFirst({ where: { id, tenantId: ctx.tenantId, companyId: existing.companyId } });
    if (!fresh || fresh.status !== "DRAFT") {
      throw new ServiceError("CONFLICT", "El asiento ya no está en borrador. Recargá e intentá de nuevo.");
    }
    await assertFinancialPeriodOpen({ tenantId: ctx.tenantId, companyId: existing.companyId, date: fresh.entryDate }, tx);

    const flipped = await tx.journalEntry.updateMany({
      where: { id, tenantId: ctx.tenantId, companyId: existing.companyId, status: "DRAFT", updatedAt: fresh.updatedAt },
      data: {
        status:          "CANCELLED",
        cancelledAt:     new Date(),
        updatedByUserId: ctx.actorUserId,
      },
    });
    assertOptimisticRowUpdate(
      flipped.count,
      "El asiento ya no está en borrador. Recargá e intentá de nuevo.",
    );

    await log(
      {
        tenantId:    ctx.tenantId,
        actorUserId: ctx.actorUserId,
        action:      "journal_entry.cancelled",
        entityType:  "JournalEntry",
        entityId:    id,
        after:       { status: "CANCELLED", ...(opts?.operationalSync ? { via: "operational_cancel_sync" } : {}) },
        ipAddress:   ctx.ipAddress,
      },
      tx,
    );
    return loadJournalEntryView(id, ctx.tenantId, existing.companyId, tx);
  };
  return opts?.tx ? cancel(opts.tx) : prisma.$transaction(cancel, journalWriteOptions);
}

export async function cancelJournalEntry(id: string, ctx: ServiceContext): Promise<JournalEntryView> {
  await assertEdit(ctx);
  const existing = await prisma.journalEntry.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Asiento no encontrado");
  await resolveAccountingCompanyId(ctx, existing.companyId);
  if (isCrossCompany(existing.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "Asiento fuera del alcance de empresa");
  }
  return cancelDraftJournalEntryCore(id, ctx, existing);
}

/** Cancel DRAFT without EDIT ACCOUNTING — used when operational source is cancelled [D-061]. */
export async function cancelJournalEntryAsAutomation(
  id: string,
  ctx: ServiceContext,
  tx?: Prisma.TransactionClient,
): Promise<JournalEntryView> {
  const existing = await (tx ?? prisma).journalEntry.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Asiento no encontrado");
  return cancelDraftJournalEntryCore(id, ctx, existing, { operationalSync: true, tx });
}

/**
 * Creates a POSTED counter-entry that reverses a POSTED journal (does not delete/cancel the original).
 */
export async function reversePostedJournalEntry(
  id: string,
  ctx: ServiceContext,
  opts?: { entryDate?: string },
): Promise<JournalEntryView> {
  await assertEdit(ctx);
  const existing = await prisma.journalEntry.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: { companyId: true },
  });
  if (!existing) throw new ServiceError("NOT_FOUND", "Asiento no encontrado");
  await resolveAccountingCompanyId(ctx, existing.companyId);
  if (isCrossCompany(existing.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "Asiento fuera del alcance de empresa");
  }
  const entryDate = parseJournalDate(opts?.entryDate ?? toIsoDateInTimeZone());

  return prisma.$transaction(async (tx) => {
    // Serialize vs period close for both original and reverse dates.
    await lockAccountingCompany(tx, ctx.tenantId, existing.companyId);
    const original = await tx.journalEntry.findFirst({
      where: { id, tenantId: ctx.tenantId, companyId: existing.companyId },
      include: { ...journalViewRelations, reversedByEntry: { select: journalReversalSelect } },
    });
    if (!original) throw new ServiceError("NOT_FOUND", "Asiento no encontrado");
    if (original.status !== "POSTED") throw new ServiceError("CONFLICT", "Solo se pueden revertir asientos contabilizados");
    if (original.reversedByEntry) throw new ServiceError("CONFLICT", "Este asiento ya tiene una reversa");
    if (original.reversesEntryId) throw new ServiceError("CONFLICT", "No se puede revertir un asiento que ya es una reversa");
    // Scope must still hold for each referenced account and project. A historical
    // account may be inactive and must still be reversible in its own company.
    assertJournalViewScope(original);
    await assertFinancialPeriodOpen({
      tenantId: ctx.tenantId,
      companyId: existing.companyId,
      date: original.entryDate,
    }, tx);
    await assertFinancialPeriodOpen(
      {
        tenantId: ctx.tenantId,
        companyId: existing.companyId,
        date: entryDate,
      },
      tx,
    );

    const created = await tx.journalEntry.create({
      data: {
        tenantId:        ctx.tenantId,
        companyId:       existing.companyId,
        projectId:       original.projectId,
        entryDate,
        status:          "POSTED",
        sourceType:      "ADJUSTMENT",
        sourceId:        original.id,
        description:     `Reversa de asiento ${original.reference ?? original.id.slice(0, 8)}`,
        reference:       `REV-${original.reference ?? original.id.slice(0, 8)}`.slice(0, 256),
        reversesEntryId: original.id,
        postedAt:        new Date(),
        createdByUserId: ctx.actorUserId,
        updatedByUserId: ctx.actorUserId,
        lines: {
          create: original.lines.map((l) => ({
            accountId:   l.accountId,
            projectId:   l.projectId,
            description: l.description ? `Reversa — ${l.description}`.slice(0, 512) : "Reversa",
            debit:       l.credit,
            credit:      l.debit,
            currency:    l.currency,
          })),
        },
      },
      include: journalViewRelations,
    });
    await log({
      tenantId:    ctx.tenantId,
      actorUserId: ctx.actorUserId,
      action:      "journal_entry.reversed",
      entityType:  "JournalEntry",
      entityId:    original.id,
      after:       { reverseEntryId: created.id },
      ipAddress:   ctx.ipAddress,
    }, tx);
    return toJournalEntryView(created);
  }, journalWriteOptions);
}

export async function getTrialBalance(
  ctx: ServiceContext,
  input: {
    companyId?: string | null;
    dateFrom?: string;
    dateTo?: string;
    /** @deprecated use dateFrom */
    fromDate?: string;
    /** @deprecated use dateTo */
    toDate?: string;
  },
): Promise<TrialBalanceRowView[]> {
  await assertView(ctx);
  const companyId = await resolveAccountingCompanyId(ctx, input.companyId ?? null);
  const dateFrom = sanitizeIsoDate(input.dateFrom ?? input.fromDate);
  const dateTo = sanitizeIsoDate(input.dateTo ?? input.toDate);
  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new ServiceError(
      "VALIDATION",
      "La fecha desde no puede ser posterior a la fecha hasta.",
    );
  }

  const entryDateFilter: Prisma.DateTimeFilter = {};
  if (dateFrom) entryDateFilter.gte = entryDateGte(dateFrom);
  if (dateTo) entryDateFilter.lte = entryDateLte(dateTo);

  const lines = await prisma.journalEntryLine.findMany({
    where: {
      account: { tenantId: ctx.tenantId, companyId },
      journalEntry: {
        tenantId: ctx.tenantId,
        companyId,
        status: "POSTED",
        ...(Object.keys(entryDateFilter).length > 0 ? { entryDate: entryDateFilter } : {}),
      },
    },
    include: {
      account: { select: { id: true, code: true, name: true, type: true } },
    },
  });

  type Agg = {
    accountId: string;
    accountCode: string;
    accountName: string;
    accountType: string;
    currency: string;
    debit: Prisma.Decimal;
    credit: Prisma.Decimal;
  };
  const map = new Map<string, Agg>();
  for (const l of lines) {
    const currency = normalizeJournalCurrency(l.currency);
    const key = `${l.accountId}|${currency}`;
    const cur = map.get(key);
    if (!cur) {
      map.set(key, {
        accountId: l.account.id,
        accountCode: l.account.code,
        accountName: l.account.name,
        accountType: l.account.type,
        currency,
        debit: l.debit,
        credit: l.credit,
      });
    } else {
      cur.debit = cur.debit.plus(l.debit);
      cur.credit = cur.credit.plus(l.credit);
    }
  }

  return [...map.values()]
    .sort((a, b) => a.accountCode.localeCompare(b.accountCode) || a.currency.localeCompare(b.currency))
    .map((r) => ({
      accountId: r.accountId,
      accountCode: r.accountCode,
      accountName: r.accountName,
      accountType: r.accountType,
      currency: r.currency,
      debit: serializeMoneyDecimal(r.debit),
      credit: serializeMoneyDecimal(r.credit),
      balance: naturalBalanceSignedString(r.accountType, r.debit, r.credit),
    }));
}
