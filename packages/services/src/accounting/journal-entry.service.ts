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
import { log } from "../audit/audit.service";
import { assertAccountingTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { resolveAccountingCompanyId } from "./accounting-company-context";

export type JournalEntryLineView = Omit<JournalEntryLine, "debit" | "credit"> & {
  debit:  string;
  credit: string;
};

export type JournalEntryView = JournalEntry & {
  lines: (JournalEntryLineView & { accountCode: string; accountName: string })[];
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
    },
  });
  if (!entry) throw new ServiceError("NOT_FOUND", "Asiento no encontrado");
  const { lines: rawLines, ...rest } = entry;
  return {
    ...rest,
    lines: rawLines.map(serializeLine),
  };
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
  if (ctx.companyId && ctx.companyId !== params.companyId) {
    throw new ServiceError("FORBIDDEN", "El asiento pertenece a otra empresa");
  }
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
): Promise<JournalEntryView[]> {
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

  const rows = await prisma.journalEntry.findMany({
    where,
    orderBy: [{ entryDate: "desc" }, { id: "desc" }],
    take: 200,
    include: {
      lines: { include: { account: true }, orderBy: { id: "asc" } },
    },
  });

  return rows.map((entry) => {
    const { lines: rawLines, ...rest } = entry;
    return { ...rest, lines: rawLines.map(serializeLine) };
  });
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

export async function getAccountLedger(
  ctx: ServiceContext,
  input: ListAccountLedgerInput,
): Promise<AccountLedgerRowView[]> {
  await assertView(ctx);
  const companyId = await resolveAccountingCompanyId(ctx, input.companyId ?? null);

  const account = await prisma.accountingAccount.findFirst({
    where: { id: input.accountId, tenantId: ctx.tenantId, companyId },
  });
  if (!account) throw new ServiceError("NOT_FOUND", "Cuenta contable no encontrada");

  const lines = await prisma.journalEntryLine.findMany({
    where: {
      accountId: input.accountId,
      journalEntry: {
        tenantId: ctx.tenantId,
        companyId,
        status: "POSTED",
      },
    },
    include: { journalEntry: true },
    orderBy: [{ journalEntry: { entryDate: "asc" } }, { journalEntry: { id: "asc" } }, { id: "asc" }],
    take: input.limit ?? 200,
  });

  return lines.map((l) => ({
    id:               l.id,
    entryId:          l.journalEntryId,
    entryDate:        l.journalEntry.entryDate.toISOString().slice(0, 10),
    entryReference:   l.journalEntry.reference,
    entryDescription: l.journalEntry.description,
    lineDescription:  l.description,
    debit:            l.debit.toString(),
    credit:           l.credit.toString(),
    currency:         l.currency,
  }));
}

export async function createJournalEntry(
  input: CreateJournalEntryInput,
  ctx: ServiceContext,
): Promise<JournalEntryView> {
  await assertEdit(ctx);
  const companyId = await resolveAccountingCompanyId(ctx, input.companyId ?? null);
  const parsed = parseJournalLinesFromInput(input.lines);
  assertBalancedJournalEntry(parsed);
  const headerProjectId = input.projectId ?? null;
  await validateAccountsAndProjects(companyId, ctx.tenantId, parsed, headerProjectId);

  const entryDate = new Date(`${input.entryDate}T00:00:00.000Z`);
  const sourceType = input.sourceType ?? "MANUAL";
  const sourceId = input.sourceId ?? null;

  const created = await prisma.$transaction(async (tx) => {
    const entry = await tx.journalEntry.create({
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
    return entry;
  });

  await log({
    tenantId:    ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action:      "journal_entry.created",
    entityType:  "JournalEntry",
    entityId:    created.id,
    after:       { status: created.status, sourceType: created.sourceType, sourceId: created.sourceId, lineCount: created.lines.length },
    ipAddress:   ctx.ipAddress,
  });

  const { lines: rawLines, ...rest } = created;
  return { ...rest, lines: rawLines.map(serializeLine) };
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
  if (ctx.companyId && existing.companyId !== ctx.companyId) {
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
  const projectId = input.projectId === undefined ? existing.projectId : input.projectId;

  let parsed: ParsedJournalLine[] | null = null;
  if (input.lines) {
    parsed = parseJournalLinesFromInput(input.lines);
    assertBalancedJournalEntry(parsed);
    await validateAccountsAndProjects(companyId, ctx.tenantId, parsed, projectId ?? null);
  }

  await prisma.$transaction(async (tx) => {
    if (parsed) {
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
  if (ctx.companyId && existing.companyId !== ctx.companyId) {
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

export async function cancelJournalEntry(id: string, ctx: ServiceContext): Promise<JournalEntryView> {
  await assertEdit(ctx);
  const existing = await prisma.journalEntry.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Asiento no encontrado");
  await resolveAccountingCompanyId(ctx, existing.companyId);
  if (ctx.companyId && existing.companyId !== ctx.companyId) {
    throw new ServiceError("FORBIDDEN", "Asiento fuera del alcance de empresa");
  }
  if (existing.status !== "DRAFT") {
    throw new ServiceError("CONFLICT", "Solo se pueden anular borradores (fase 11A)");
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
