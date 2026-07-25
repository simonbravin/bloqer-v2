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
import { roundMoney } from "@bloqer/utils";
import { log } from "../audit/audit.service";
import { isCrossCompany } from "../company-scope";
import { assertAccountingTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { resolveAccountingCompanyId } from "./accounting-company-context";
import {
  applyNaturalRunningBalance,
  naturalBalance,
  naturalBalanceSignedString,
} from "./accounting-natural-balance";
import { entryDateGte, entryDateLte, sanitizeIsoDate } from "./accounting-date";

/** Sourced journals mirror an operational document [D-063]. */
export function isSourcedJournalEntry(entry: {
  sourceType: JournalEntrySourceType;
  sourceId: string | null;
}): boolean {
  return entry.sourceType !== "MANUAL" && entry.sourceId != null;
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
    const exDebit = roundMoney(typeof ex.debit === "string" ? ex.debit : ex.debit.toString());
    const exCredit = roundMoney(typeof ex.credit === "string" ? ex.credit : ex.credit.toString());
    const nwDebit = roundMoney(nw.debit.toString());
    const nwCredit = roundMoney(nw.credit.toString());
    if (exDebit !== nwDebit || exCredit !== nwCredit || ex.currency !== nw.currency) {
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

/** At least 2 lines; each line exactly one of debit/credit &gt; 0; balanced per currency. */
export function assertBalancedJournalEntry(lines: ParsedJournalLine[]): void {
  if (lines.length < 2) {
    throw new ServiceError("VALIDATION", "El asiento debe tener al menos dos líneas");
  }
  const totals = new Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>();
  for (const line of lines) {
    const dz = line.debit.equals(0);
    const cz = line.credit.equals(0);
    if (dz && cz) {
      throw new ServiceError("VALIDATION", "Cada línea debe tener debe o haber mayor a cero");
    }
    if (!dz && !cz) {
      throw new ServiceError("VALIDATION", "Cada línea solo puede registrar debe o haber, no ambos");
    }
    const cur = line.currency.trim().toUpperCase();
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
    debit:       new Prisma.Decimal(l.debit ?? "0"),
    credit:      new Prisma.Decimal(l.credit ?? "0"),
    currency:    l.currency.trim(),
  }));
}

function serializeLine(
  line: JournalEntryLine & { account: { code: string; name: string } },
): JournalEntryView["lines"][number] {
  return {
    ...line,
    debit:       line.debit.toString(),
    credit:      line.credit.toString(),
    accountCode: line.account.code,
    accountName: line.account.name,
  };
}

async function loadJournalEntryView(
  id: string,
  tenantId: string,
  companyId: string,
): Promise<JournalEntryView> {
  const entry = await prisma.journalEntry.findFirst({
    where: { id, tenantId, companyId },
    include: {
      lines: { include: { account: true }, orderBy: { id: "asc" } },
      reversedByEntry: { select: { id: true } },
    },
  });
  if (!entry) throw new ServiceError("NOT_FOUND", "Asiento no encontrado");
  const { lines: rawLines, reversedByEntry, ...rest } = entry;
  return {
    ...rest,
    reversedByEntryId: reversedByEntry?.id ?? null,
    lines: rawLines.map(serializeLine),
  };
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
): Promise<void> {
  const accountIds = [...new Set(lines.map((l) => l.accountId))];
  const accounts = await prisma.accountingAccount.findMany({
    where: { id: { in: accountIds }, tenantId, companyId, isActive: true },
  });
  if (accounts.length !== accountIds.length) {
    throw new ServiceError(
      "VALIDATION",
      "Una o más cuentas contables no existen, están inactivas o no pertenecen a la empresa",
    );
  }

  const projectIds = new Set<string>();
  if (headerProjectId) projectIds.add(headerProjectId);
  for (const l of lines) {
    if (l.projectId) projectIds.add(l.projectId);
  }
  if (projectIds.size > 0) {
    const projects = await prisma.project.findMany({
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

  const where: Prisma.JournalEntryWhereInput = {
    tenantId:  ctx.tenantId,
    companyId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.fromDate || filters.toDate
      ? {
          entryDate: {
            ...(filters.fromDate ? { gte: new Date(`${filters.fromDate}T00:00:00.000Z`) } : {}),
            ...(filters.toDate ? { lte: new Date(`${filters.toDate}T23:59:59.999Z`) } : {}),
          },
        }
      : {}),
  };

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;

  const [rows, total] = await Promise.all([
    prisma.journalEntry.findMany({
      where,
      orderBy: [{ entryDate: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        lines: { include: { account: true }, orderBy: { id: "asc" } },
      },
    }),
    prisma.journalEntry.count({ where }),
  ]);

  const data = rows.map((entry) => {
    const { lines: rawLines, ...rest } = entry;
    return { ...rest, reversedByEntryId: null, lines: rawLines.map(serializeLine) };
  });

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
): Promise<Map<string, Prisma.Decimal>> {
  const prior = await prisma.journalEntryLine.findMany({
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
    const cur = map.get(l.currency);
    if (!cur) map.set(l.currency, { debit: l.debit, credit: l.credit });
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

  const limit = input.limit ?? 200;
  const lines = await prisma.journalEntryLine.findMany({
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
  const truncated = lines.length > limit;
  const slice = truncated ? lines.slice(0, limit) : lines;

  const byCurrency = dateFrom
    ? await loadOpeningBalancesByCurrency(ctx, companyId, account.id, account.type, dateFrom)
    : new Map<string, Prisma.Decimal>();

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
        debit: "0",
        credit: "0",
        currency,
        runningBalance: bal.toString(),
        isOpening: true,
      });
    }
  }

  const movementRows = slice.map((l) => {
    const cur = l.currency;
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
      debit:            l.debit.toString(),
      credit:           l.credit.toString(),
      currency:         l.currency,
      runningBalance:   next.toString(),
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
): Promise<JournalEntryView> {
  const parsed = parseJournalLinesFromInput(input.lines);
  assertBalancedJournalEntry(parsed);
  const headerProjectId = input.projectId ?? null;
  await validateAccountsAndProjects(companyId, ctx.tenantId, parsed, headerProjectId);

  const entryDate = new Date(`${input.entryDate}T00:00:00.000Z`);
  const sourceType = input.sourceType ?? "MANUAL";
  const sourceId = input.sourceId ?? null;

  try {
    const { entry: created, wasExisting } = await prisma.$transaction(async (tx) => {
      if (sourceId) {
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
            include: { lines: { include: { account: true }, orderBy: { id: "asc" } } },
          });
          return { entry: row, wasExisting: true };
        }
      }
      const row = await tx.journalEntry.create({
        data: {
          tenantId:        ctx.tenantId,
          companyId,
          projectId:       headerProjectId,
          entryDate,
          status:          "DRAFT",
          sourceType,
          sourceId,
          description:     input.description.trim(),
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
        include: { lines: { include: { account: true }, orderBy: { id: "asc" } } },
      });
      return { entry: row, wasExisting: false };
    });

    if (!wasExisting) {
      await log({
        tenantId:    ctx.tenantId,
        actorUserId: ctx.actorUserId,
        action:      "journal_entry.created",
        entityType:  "JournalEntry",
        entityId:    created.id,
        after:       {
          status: created.status,
          sourceType: created.sourceType,
          sourceId: created.sourceId,
          lineCount: created.lines.length,
        },
        ipAddress:   ctx.ipAddress,
      });
    }

    const { lines: rawLines, ...rest } = created;
    return { ...rest, reversedByEntryId: null, lines: rawLines.map(serializeLine) };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && sourceId) {
      const existingId = await lookupNonCancelledJournalEntryIdBySource(ctx, {
        companyId,
        sourceType,
        sourceId,
      });
      if (existingId) {
        return loadJournalEntryView(existingId, ctx.tenantId, companyId);
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
  const companyId = await resolveAccountingCompanyId(ctx, input.companyId ?? null);
  return persistJournalEntryCreate(input, ctx, companyId);
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

  const entryDate = input.entryDate
    ? new Date(`${input.entryDate}T00:00:00.000Z`)
    : existing.entryDate;
  const description = input.description?.trim() ?? existing.description;
  const reference = input.reference === undefined ? existing.reference : input.reference?.trim() ?? null;
  // Sourced journals keep header project from the operational document [D-063].
  const projectId = isSourcedJournalEntry(existing)
    ? existing.projectId
    : input.projectId === undefined
      ? existing.projectId
      : input.projectId;

  let parsed: ParsedJournalLine[] | null = null;
  let sourcedExistingLines: Array<{
    id: string;
    debit: Prisma.Decimal;
    credit: Prisma.Decimal;
    currency: string;
    projectId: string | null;
  }> | null = null;
  const sourced = isSourcedJournalEntry(existing);

  if (input.lines) {
    parsed = parseJournalLinesFromInput(input.lines);
    assertBalancedJournalEntry(parsed);
    if (sourced) {
      sourcedExistingLines = await prisma.journalEntryLine.findMany({
        where: { journalEntryId: id },
        orderBy: { id: "asc" },
        select: { id: true, debit: true, credit: true, currency: true, projectId: true },
      });
      assertSourcedLineMoneyUnchanged(sourcedExistingLines, parsed);
      // Defense in depth: never persist client money/project on sourced lines.
      parsed = parsed.map((l, i) => {
        const ex = sourcedExistingLines![i]!;
        return {
          ...l,
          debit: ex.debit,
          credit: ex.credit,
          currency: ex.currency,
          projectId: ex.projectId,
        };
      });
    }
    await validateAccountsAndProjects(companyId, ctx.tenantId, parsed, projectId ?? null);
  }

  await prisma.$transaction(async (tx) => {
    if (parsed) {
      if (sourced && sourcedExistingLines) {
        // In-place updates keep line ids/order stable (delete+create reshuffles UUID order).
        for (let i = 0; i < sourcedExistingLines.length; i++) {
          const ex = sourcedExistingLines[i]!;
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
    await tx.journalEntry.update({
      where: { id },
      data: {
        entryDate,
        description,
        reference,
        projectId,
        updatedByUserId: ctx.actorUserId,
      },
    });
  });

  await log({
    tenantId:    ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action:      "journal_entry.updated",
    entityType:  "JournalEntry",
    entityId:    id,
    after:       input,
    ipAddress:   ctx.ipAddress,
  });

  return loadJournalEntryView(id, ctx.tenantId, existing.companyId);
}

export async function postJournalEntry(id: string, ctx: ServiceContext): Promise<JournalEntryView> {
  await assertEdit(ctx);
  const existing = await prisma.journalEntry.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: { lines: true },
  });
  if (!existing) throw new ServiceError("NOT_FOUND", "Asiento no encontrado");
  await resolveAccountingCompanyId(ctx, existing.companyId);
  if (isCrossCompany(existing.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "Asiento fuera del alcance de empresa");
  }
  if (existing.status !== "DRAFT") {
    throw new ServiceError("CONFLICT", "Solo se pueden contabilizar borradores");
  }

  const parsed: ParsedJournalLine[] = existing.lines.map((l) => ({
    accountId:   l.accountId,
    projectId:   l.projectId,
    description: l.description,
    debit:       l.debit,
    credit:      l.credit,
    currency:    l.currency,
  }));
  assertBalancedJournalEntry(parsed);

  await prisma.journalEntry.update({
    where: { id },
    data: {
      status:          "POSTED",
      postedAt:        new Date(),
      updatedByUserId: ctx.actorUserId,
    },
  });

  await log({
    tenantId:    ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action:      "journal_entry.posted",
    entityType:  "JournalEntry",
    entityId:    id,
    after:       { status: "POSTED" },
    ipAddress:   ctx.ipAddress,
  });

  return loadJournalEntryView(id, ctx.tenantId, existing.companyId);
}

async function cancelDraftJournalEntryCore(
  id: string,
  ctx: ServiceContext,
  existing: JournalEntry,
): Promise<JournalEntryView> {
  if (existing.status !== "DRAFT") {
    throw new ServiceError("CONFLICT", "Solo se pueden anular borradores");
  }

  await prisma.journalEntry.update({
    where: { id },
    data: {
      status:          "CANCELLED",
      cancelledAt:     new Date(),
      updatedByUserId: ctx.actorUserId,
    },
  });

  await log({
    tenantId:    ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action:      "journal_entry.cancelled",
    entityType:  "JournalEntry",
    entityId:    id,
    after:       { status: "CANCELLED" },
    ipAddress:   ctx.ipAddress,
  });

  return loadJournalEntryView(id, ctx.tenantId, existing.companyId);
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
): Promise<JournalEntryView> {
  const existing = await prisma.journalEntry.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Asiento no encontrado");
  return cancelDraftJournalEntryCore(id, ctx, existing);
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
    include: {
      lines: { orderBy: { id: "asc" } },
      reversedByEntry: { select: { id: true } },
    },
  });
  if (!existing) throw new ServiceError("NOT_FOUND", "Asiento no encontrado");
  await resolveAccountingCompanyId(ctx, existing.companyId);
  if (isCrossCompany(existing.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "Asiento fuera del alcance de empresa");
  }
  if (existing.status !== "POSTED") {
    throw new ServiceError("CONFLICT", "Solo se pueden revertir asientos contabilizados");
  }
  if (existing.reversedByEntry) {
    throw new ServiceError("CONFLICT", "Este asiento ya tiene una reversa");
  }
  if (existing.reversesEntryId) {
    throw new ServiceError("CONFLICT", "No se puede revertir un asiento que ya es una reversa");
  }

  const entryDateStr =
    opts?.entryDate ?? new Date().toISOString().slice(0, 10);
  const entryDate = new Date(`${entryDateStr}T00:00:00.000Z`);

  const reverse = await prisma.$transaction(async (tx) => {
    const created = await tx.journalEntry.create({
      data: {
        tenantId:        ctx.tenantId,
        companyId:       existing.companyId,
        projectId:       existing.projectId,
        entryDate,
        status:          "POSTED",
        sourceType:      "ADJUSTMENT",
        sourceId:        existing.id,
        description:     `Reversa de asiento ${existing.reference ?? existing.id.slice(0, 8)}`,
        reference:       existing.reference ? `REV-${existing.reference}` : `REV-${existing.id.slice(0, 8)}`,
        reversesEntryId: existing.id,
        postedAt:        new Date(),
        createdByUserId: ctx.actorUserId,
        updatedByUserId: ctx.actorUserId,
        lines: {
          create: existing.lines.map((l) => ({
            accountId:   l.accountId,
            projectId:   l.projectId,
            description: l.description ? `Reversa — ${l.description}` : "Reversa",
            debit:       l.credit,
            credit:      l.debit,
            currency:    l.currency,
          })),
        },
      },
      include: { lines: { include: { account: true }, orderBy: { id: "asc" } } },
    });
    return created;
  });

  await log({
    tenantId:    ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action:      "journal_entry.reversed",
    entityType:  "JournalEntry",
    entityId:    existing.id,
    after:       { reverseEntryId: reverse.id },
    ipAddress:   ctx.ipAddress,
  });

  const { lines: rawLines, ...rest } = reverse;
  return { ...rest, reversedByEntryId: null, lines: rawLines.map(serializeLine) };
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
    const key = `${l.accountId}|${l.currency}`;
    const cur = map.get(key);
    if (!cur) {
      map.set(key, {
        accountId: l.account.id,
        accountCode: l.account.code,
        accountName: l.account.name,
        accountType: l.account.type,
        currency: l.currency,
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
      debit: r.debit.toString(),
      credit: r.credit.toString(),
      balance: naturalBalanceSignedString(r.accountType, r.debit, r.credit),
    }));
}
