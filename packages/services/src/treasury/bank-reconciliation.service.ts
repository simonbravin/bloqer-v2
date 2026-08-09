import { randomUUID } from "crypto";
import { Prisma, prisma } from "@bloqer/database";
import { can, hasCompanyFinanceRole } from "@bloqer/domain";
import type {
  AddBankStatementLineInput,
  CreateBankReconciliationInput,
  CreateMovementFromStatementLineInput,
  ImportBankStatementCsvInput,
  ImportBankStatementOfxInput,
  MatchBankReconciliationInput,
  ReopenBankReconciliationInput,
} from "@bloqer/validators";
import { auditTreasury } from "./treasury-audit";
import { parseBankStatementCsv, type ParsedBankStatementCsvLine } from "./bank-statement-csv-parser";
import { parseBankStatementOfx } from "./bank-statement-ofx-parser";
import { getAccountBalance } from "./balance.service";
import { canViewCompanyTreasury } from "../finance/finance-access";
import { serializeMoneyDecimal, toMoneyDecimal } from "../finance/money-decimal";
import { resolvePagination } from "../finance/pagination";
import { ensureDraftJournalFromTreasuryMovement } from "../accounting/accounting-auto-draft.service";
import {
  assertJournalAllowsOperationalCancel,
  cancelDraftJournalOnOperationalCancel,
} from "../accounting/accounting-cancel-sync.service";
import { assertTenantModuleEnabled } from "../tenant-modules/tenant-module.service";
import { assertTreasuryTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { assertOptimisticRowUpdate } from "../finance/optimistic-lock";
import { assertFinancialPeriodOpen } from "../finance/period-lock.service";

type TxClient = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

const EDITABLE_STATUSES = ["DRAFT", "IN_PROGRESS"] as const;

function assertCanEditBankReconciliation(roles: ServiceContext["roles"]): void {
  if (!hasCompanyFinanceRole(roles) || !can(roles, "EDIT", "BANK_RECONCILIATION")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar conciliaciones bancarias");
  }
}

function assertCanViewBankReconciliation(roles: ServiceContext["roles"]): void {
  if (!canViewCompanyTreasury(roles) || !can(roles, "VIEW", "BANK_RECONCILIATION")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver conciliaciones bancarias");
  }
}

async function assertBankReconciliationModules(ctx: ServiceContext): Promise<void> {
  await assertTreasuryTenantModule(ctx);
  await assertTenantModuleEnabled(ctx, "BANK_RECONCILIATION");
}

function movementMatchesDirection(
  movementType: string,
  direction: "CREDIT" | "DEBIT",
): boolean {
  const isInflow = movementType === "INFLOW" || movementType === "TRANSFER_IN";
  return direction === "CREDIT" ? isInflow : !isInflow;
}

async function loadSessionOrThrow(id: string, ctx: ServiceContext, tx: TxClient = prisma) {
  const session = await tx.bankReconciliation.findUnique({
    where: { id },
    include: {
      account: { select: { id: true, name: true, currency: true, companyId: true } },
      lines: {
        orderBy: [{ lineDate: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          match: {
            include: {
              accountMovement: {
                select: {
                  id: true,
                  movementDate: true,
                  type: true,
                  amount: true,
                  description: true,
                  status: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!session) throw new ServiceError("NOT_FOUND", "Conciliación no encontrada");
  if (session.tenantId !== ctx.tenantId) {
    throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  }
  return session;
}

function serializeSession(
  session: Awaited<ReturnType<typeof loadSessionOrThrow>>,
) {
  const lineViews = session.lines.map((line) => ({
    id: line.id,
    lineDate: line.lineDate,
    description: line.description,
    amount: serializeMoneyDecimal(line.amount),
    direction: line.direction,
    reference: line.reference,
    sortOrder: line.sortOrder,
    match: line.match
      ? {
          id: line.match.id,
          accountMovementId: line.match.accountMovementId,
          matchedAt: line.match.matchedAt,
          movement: {
            id: line.match.accountMovement.id,
            movementDate: line.match.accountMovement.movementDate,
            type: line.match.accountMovement.type,
            amount: serializeMoneyDecimal(line.match.accountMovement.amount),
            description: line.match.accountMovement.description,
            status: line.match.accountMovement.status,
          },
        }
      : null,
  }));

  const credits = session.lines
    .filter((l) => l.direction === "CREDIT")
    .reduce((s, l) => s.plus(l.amount), new Prisma.Decimal(0));
  const debits = session.lines
    .filter((l) => l.direction === "DEBIT")
    .reduce((s, l) => s.plus(l.amount), new Prisma.Decimal(0));
  const impliedClosing = session.openingBalance.plus(credits).minus(debits);
  const unmatchedLines = lineViews.filter((l) => !l.match).length;

  return {
    id: session.id,
    accountId: session.accountId,
    accountName: session.account.name,
    companyId: session.companyId,
    periodStart: session.periodStart,
    periodEnd: session.periodEnd,
    currency: session.currency,
    openingBalance: serializeMoneyDecimal(session.openingBalance),
    closingBalance: serializeMoneyDecimal(session.closingBalance),
    impliedClosingBalance: serializeMoneyDecimal(impliedClosing),
    statementBalances: impliedClosing.equals(session.closingBalance),
    unmatchedLines,
    status: session.status,
    notes: session.notes,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    lines: lineViews,
  };
}

export type BankReconciliationView = ReturnType<typeof serializeSession>;

export async function getBankReconciliationById(
  id: string,
  ctx: ServiceContext,
): Promise<BankReconciliationView> {
  await assertBankReconciliationModules(ctx);
  assertCanViewBankReconciliation(ctx.roles);
  const session = await loadSessionOrThrow(id, ctx);
  return serializeSession(session);
}

export type BankReconciliationListItem = BankReconciliationView & {
  /** CONFIRMED movements in the period still not RECONCILED; null when session is CANCELLED. */
  unreconciledMovementCount: number | null;
};

export async function listBankReconciliations(
  ctx: ServiceContext,
  filters?: {
    accountId?: string;
    status?: "DRAFT" | "IN_PROGRESS" | "CLOSED" | "CANCELLED";
    page?: number;
    pageSize?: number;
  },
): Promise<{ data: BankReconciliationListItem[]; total: number }> {
  await assertBankReconciliationModules(ctx);
  assertCanViewBankReconciliation(ctx.roles);
  const { skip, take, pageSize } = resolvePagination(filters);

  const where: Prisma.BankReconciliationWhereInput = {
    tenantId: ctx.tenantId,
    ...(filters?.accountId ? { accountId: filters.accountId } : {}),
    ...(filters?.status ? { status: filters.status } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.bankReconciliation.findMany({
      where,
      orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }],
      skip,
      take: pageSize,
      select: { id: true },
    }),
    prisma.bankReconciliation.count({ where }),
  ]);

  const data: BankReconciliationListItem[] = [];
  for (const row of rows) {
    const view = await getBankReconciliationById(row.id, ctx);
    let unreconciledMovementCount: number | null = null;
    if (view.status !== "CANCELLED") {
      unreconciledMovementCount = await prisma.accountMovement.count({
        where: {
          tenantId: ctx.tenantId,
          accountId: view.accountId,
          status: "CONFIRMED",
          movementDate: { gte: view.periodStart, lte: view.periodEnd },
        },
      });
    }
    data.push({ ...view, unreconciledMovementCount });
  }
  return { data, total };
}

export async function listCandidateMovementsForReconciliation(
  reconciliationId: string,
  ctx: ServiceContext,
): Promise<
  Array<{
    id: string;
    movementDate: Date;
    type: string;
    amount: string;
    description: string;
    status: string;
  }>
> {
  await assertBankReconciliationModules(ctx);
  assertCanViewBankReconciliation(ctx.roles);
  const session = await loadSessionOrThrow(reconciliationId, ctx);

  const movements = await prisma.accountMovement.findMany({
    where: {
      tenantId: ctx.tenantId,
      accountId: session.accountId,
      status: "CONFIRMED",
      movementDate: {
        gte: session.periodStart,
        lte: session.periodEnd,
      },
    },
    orderBy: [{ movementDate: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      movementDate: true,
      type: true,
      amount: true,
      description: true,
      status: true,
    },
  });

  return movements.map((m) => ({
    id: m.id,
    movementDate: m.movementDate,
    type: m.type,
    amount: serializeMoneyDecimal(m.amount),
    description: m.description,
    status: m.status,
  }));
}

export async function createBankReconciliation(
  input: CreateBankReconciliationInput,
  ctx: ServiceContext,
): Promise<BankReconciliationView> {
  await assertBankReconciliationModules(ctx);
  assertCanEditBankReconciliation(ctx.roles);

  const account = await prisma.treasuryAccount.findUnique({ where: { id: input.accountId } });
  if (!account) throw new ServiceError("NOT_FOUND", "Cuenta de tesorería no encontrada");
  if (account.tenantId !== ctx.tenantId) {
    throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  }
  if (account.status !== "ACTIVE") {
    throw new ServiceError("CONFLICT", "La cuenta de tesorería no está activa");
  }

  const periodStart = new Date(input.periodStart);
  const periodEnd = new Date(input.periodEnd);

  let created: string;
  try {
    created = await prisma.$transaction(async (tx) => {
      // Re-check inside the txn; DB partial unique enforces one open session per account.
      const openSession = await tx.bankReconciliation.findFirst({
        where: {
          tenantId: ctx.tenantId,
          accountId: input.accountId,
          status: { in: ["DRAFT", "IN_PROGRESS"] },
        },
        select: { id: true },
      });
      if (openSession) {
        throw new ServiceError(
          "CONFLICT",
          "Ya hay una conciliación abierta para esta cuenta. Cerrala o cancelala antes de crear otra.",
        );
      }

      const overlapping = await tx.bankReconciliation.findFirst({
        where: {
          tenantId: ctx.tenantId,
          accountId: input.accountId,
          status: { not: "CANCELLED" },
          periodStart: { lte: periodEnd },
          periodEnd: { gte: periodStart },
        },
        select: { id: true, status: true },
      });
      if (overlapping) {
        throw new ServiceError(
          "CONFLICT",
          "Ya existe una conciliación (incluida cerrada) que solapa este período para la cuenta",
        );
      }

      const session = await tx.bankReconciliation.create({
        data: {
          tenantId: ctx.tenantId,
          companyId: account.companyId,
          accountId: account.id,
          periodStart,
          periodEnd,
          currency: account.currency,
          openingBalance: toMoneyDecimal(input.openingBalance),
          closingBalance: toMoneyDecimal(input.closingBalance),
          notes: input.notes ?? null,
          status: "DRAFT",
          createdBy: ctx.actorUserId,
          updatedBy: ctx.actorUserId,
        },
      });

      await auditTreasury(
        ctx,
        "bank_reconciliation.created",
        "BankReconciliation",
        session.id,
        { companyId: account.companyId },
        {
          after: {
            accountId: account.id,
            periodStart: input.periodStart,
            periodEnd: input.periodEnd,
            status: "DRAFT",
          },
          tx,
        },
      );

      return session.id;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ServiceError(
        "CONFLICT",
        "Ya hay una conciliación abierta para esta cuenta. Cerrala o cancelala antes de crear otra.",
      );
    }
    throw err;
  }

  return getBankReconciliationById(created, ctx);
}

export async function startBankReconciliation(
  id: string,
  ctx: ServiceContext,
): Promise<BankReconciliationView> {
  await assertBankReconciliationModules(ctx);
  assertCanEditBankReconciliation(ctx.roles);

  await prisma.$transaction(async (tx) => {
    const session = await tx.bankReconciliation.findUnique({ where: { id } });
    if (!session) throw new ServiceError("NOT_FOUND", "Conciliación no encontrada");
    if (session.tenantId !== ctx.tenantId) {
      throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    }
    if (session.status !== "DRAFT") {
      throw new ServiceError("CONFLICT", "Solo se puede iniciar una conciliación en borrador");
    }
    const flipped = await tx.bankReconciliation.updateMany({
      where: { id, tenantId: ctx.tenantId, status: "DRAFT" },
      data: { status: "IN_PROGRESS", updatedBy: ctx.actorUserId },
    });
    assertOptimisticRowUpdate(
      flipped.count,
      "La conciliación ya no está en borrador. Recargá e intentá de nuevo.",
    );
    await auditTreasury(
      ctx,
      "bank_reconciliation.started",
      "BankReconciliation",
      id,
      { companyId: session.companyId },
      { after: { status: "IN_PROGRESS" }, tx },
    );
  });

  return getBankReconciliationById(id, ctx);
}

export async function addBankStatementLine(
  input: AddBankStatementLineInput,
  ctx: ServiceContext,
): Promise<BankReconciliationView> {
  await assertBankReconciliationModules(ctx);
  assertCanEditBankReconciliation(ctx.roles);

  await prisma.$transaction(async (tx) => {
    const session = await ensureInProgress(tx, input.reconciliationId, ctx);
    const lineDate = new Date(input.lineDate);
    if (lineDate < session.periodStart || lineDate > session.periodEnd) {
      throw new ServiceError(
        "VALIDATION",
        "La fecha de la línea debe estar dentro del período de la conciliación",
      );
    }

    const maxSort = await tx.bankStatementLine.aggregate({
      where: { reconciliationId: session.id },
      _max: { sortOrder: true },
    });

    await tx.bankStatementLine.create({
      data: {
        tenantId: ctx.tenantId,
        reconciliationId: session.id,
        lineDate,
        description: input.description,
        amount: toMoneyDecimal(input.amount),
        direction: input.direction,
        reference: input.reference ?? null,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
    });

    await tx.bankReconciliation.update({
      where: { id: session.id },
      data: { updatedBy: ctx.actorUserId },
    });
  });

  return getBankReconciliationById(input.reconciliationId, ctx);
}

/** Bulk-add extract lines from Bloqer CSV ([D-076]). Skips rows outside the session period. */
export async function importBankStatementLinesFromCsv(
  input: ImportBankStatementCsvInput,
  ctx: ServiceContext,
): Promise<
  BankReconciliationView & {
    importedCount: number;
    skippedOutOfPeriod: number;
    skippedDuplicates: number;
  }
> {
  const parsed = parseBankStatementCsv(input.csvText);
  if (!parsed.ok) {
    throw new ServiceError("VALIDATION", parsed.error);
  }
  return importParsedBankStatementLines({
    reconciliationId: input.reconciliationId,
    lines: parsed.lines,
    auditAction: "bank_reconciliation.csv_imported",
    formatLabel: "D-076",
    ctx,
  });
}

/** Bulk-add extract lines from OFX/QFX ([D-079]). Skips rows outside the session period. */
export async function importBankStatementLinesFromOfx(
  input: ImportBankStatementOfxInput,
  ctx: ServiceContext,
): Promise<
  BankReconciliationView & {
    importedCount: number;
    skippedOutOfPeriod: number;
    skippedDuplicates: number;
  }
> {
  const parsed = parseBankStatementOfx(input.ofxText);
  if (!parsed.ok) {
    throw new ServiceError("VALIDATION", parsed.error);
  }
  return importParsedBankStatementLines({
    reconciliationId: input.reconciliationId,
    lines: parsed.lines,
    auditAction: "bank_reconciliation.ofx_imported",
    formatLabel: "D-079",
    ctx,
  });
}

async function importParsedBankStatementLines(params: {
  reconciliationId: string;
  lines: ParsedBankStatementCsvLine[];
  auditAction: string;
  formatLabel: string;
  ctx: ServiceContext;
}): Promise<
  BankReconciliationView & {
    importedCount: number;
    skippedOutOfPeriod: number;
    skippedDuplicates: number;
  }
> {
  const { reconciliationId, lines, auditAction, formatLabel, ctx } = params;
  await assertBankReconciliationModules(ctx);
  assertCanEditBankReconciliation(ctx.roles);

  let importedCount = 0;
  let skippedOutOfPeriod = 0;
  let skippedDuplicates = 0;

  await prisma.$transaction(async (tx) => {
    const session = await ensureInProgress(tx, reconciliationId, ctx);

    const maxSort = await tx.bankStatementLine.aggregate({
      where: { reconciliationId: session.id },
      _max: { sortOrder: true },
    });
    let sortOrder = (maxSort._max.sortOrder ?? -1) + 1;

    const inPeriod = lines.filter((line) => {
      const d = new Date(`${line.lineDate}T00:00:00.000Z`);
      return d >= session.periodStart && d <= session.periodEnd;
    });
    skippedOutOfPeriod = lines.length - inPeriod.length;

    if (inPeriod.length === 0) {
      throw new ServiceError(
        "VALIDATION",
        skippedOutOfPeriod > 0
          ? "Todas las filas están fuera del período de la conciliación"
          : "No hay filas para importar",
      );
    }

    // Dedupe by FITID/reference when present (re-import same file).
    const refs = [
      ...new Set(
        inPeriod
          .map((l) => l.reference?.trim())
          .filter((r): r is string => !!r && r.length > 0),
      ),
    ];
    const existingRefs = new Set<string>();
    if (refs.length > 0) {
      const existing = await tx.bankStatementLine.findMany({
        where: { reconciliationId: session.id, reference: { in: refs } },
        select: { reference: true },
      });
      for (const row of existing) {
        if (row.reference) existingRefs.add(row.reference);
      }
    }

    const seenInBatch = new Set<string>();
    const toInsert = inPeriod.filter((line) => {
      const ref = line.reference?.trim();
      if (!ref) return true;
      if (existingRefs.has(ref) || seenInBatch.has(ref)) {
        skippedDuplicates += 1;
        return false;
      }
      seenInBatch.add(ref);
      return true;
    });

    if (toInsert.length === 0) {
      throw new ServiceError(
        "VALIDATION",
        skippedDuplicates > 0
          ? "Todas las filas ya estaban importadas (referencia duplicada)"
          : "No hay filas para importar",
      );
    }

    await tx.bankStatementLine.createMany({
      data: toInsert.map((line) => ({
        tenantId: ctx.tenantId,
        reconciliationId: session.id,
        lineDate: new Date(`${line.lineDate}T00:00:00.000Z`),
        description: line.description,
        amount: toMoneyDecimal(line.amount),
        direction: line.direction,
        reference: line.reference,
        sortOrder: sortOrder++,
      })),
    });
    importedCount = toInsert.length;

    await tx.bankReconciliation.update({
      where: { id: session.id },
      data: { updatedBy: ctx.actorUserId },
    });

    await auditTreasury(
      ctx,
      auditAction,
      "BankReconciliation",
      session.id,
      { companyId: session.companyId },
      {
        after: { importedCount, skippedOutOfPeriod, skippedDuplicates, format: formatLabel },
        tx,
      },
    );
  });

  const view = await getBankReconciliationById(reconciliationId, ctx);
  return { ...view, importedCount, skippedOutOfPeriod, skippedDuplicates };
}

/**
 * Creates a CONFIRMED treasury movement from an unmatched statement line and matches it
 * (bank debit/credit not yet in Bloqer — [BANK_RECONCILIATION.md] §8 / §13).
 */
export async function createMovementFromStatementLine(
  input: CreateMovementFromStatementLineInput,
  ctx: ServiceContext,
): Promise<BankReconciliationView> {
  await assertBankReconciliationModules(ctx);
  assertCanEditBankReconciliation(ctx.roles);

  const movementId = randomUUID();

  await prisma.$transaction(async (tx) => {
    const session = await ensureInProgress(tx, input.reconciliationId, ctx);

    const line = await tx.bankStatementLine.findUnique({
      where: { id: input.statementLineId },
      include: { match: true },
    });
    if (!line || line.reconciliationId !== session.id) {
      throw new ServiceError("NOT_FOUND", "Línea de extracto no encontrada en esta sesión");
    }
    if (line.match) {
      throw new ServiceError("CONFLICT", "La línea ya está emparejada");
    }

    const account = await tx.treasuryAccount.findUnique({ where: { id: session.accountId } });
    if (!account) throw new ServiceError("NOT_FOUND", "Cuenta de tesorería no encontrada");
    if (account.status !== "ACTIVE") {
      throw new ServiceError("CONFLICT", "La cuenta de tesorería no está activa");
    }

    const amount = line.amount;
    const movementType = line.direction === "CREDIT" ? "INFLOW" : "OUTFLOW";

    if (movementType === "OUTFLOW") {
      const balance = await getAccountBalance(account.id, tx);
      if (amount.greaterThan(balance)) {
        throw new ServiceError(
          "CONFLICT",
          `Saldo insuficiente en la cuenta. Disponible: ${serializeMoneyDecimal(balance)} ${account.currency}.`,
        );
      }
    }

    const companyId = session.companyId ?? account.companyId ?? ctx.companyId ?? null;
    if (!companyId) {
      throw new ServiceError(
        "VALIDATION",
        "El movimiento requiere una empresa en la cuenta o en el contexto activo (el período cerrado no se puede omitir)",
      );
    }
    const description = line.description.startsWith("Conciliación:")
      ? line.description
      : `Conciliación: ${line.description}`;

    await assertFinancialPeriodOpen(
      {
        tenantId: ctx.tenantId,
        companyId,
        date: line.lineDate,
      },
      tx,
    );

    await tx.accountMovement.create({
      data: {
        id: movementId,
        tenantId: ctx.tenantId,
        companyId,
        accountId: account.id,
        movementDate: line.lineDate,
        type: movementType,
        sourceType: "MANUAL_ADJUSTMENT",
        sourceId: line.id,
        currency: account.currency,
        amount,
        description,
        externalInvoiceRef: line.reference,
        status: "CONFIRMED",
        createdBy: ctx.actorUserId,
      },
    });

    await auditTreasury(
      ctx,
      "account_movement.confirmed",
      "AccountMovement",
      movementId,
      { companyId },
      {
        after: {
          type: movementType,
          sourceType: "MANUAL_ADJUSTMENT",
          amount: serializeMoneyDecimal(amount),
          reconciliationId: session.id,
          statementLineId: line.id,
        },
        tx,
      },
    );

    // Match in the same transaction so we never leave an unmatched CONFIRMED adjustment.
    await tx.bankReconciliationMatch.create({
      data: {
        tenantId: ctx.tenantId,
        reconciliationId: session.id,
        statementLineId: line.id,
        accountMovementId: movementId,
        matchedBy: ctx.actorUserId,
      },
    });
    await markMovementReconciled(tx, movementId);
    await tx.bankReconciliation.update({
      where: { id: session.id },
      data: { updatedBy: ctx.actorUserId },
    });
    await auditTreasury(
      ctx,
      "account_movement.reconciled",
      "AccountMovement",
      movementId,
      { companyId: session.companyId },
      {
        after: {
          status: "RECONCILED",
          reconciliationId: session.id,
          statementLineId: line.id,
        },
        tx,
      },
    );
  });

  await ensureDraftJournalFromTreasuryMovement(movementId, ctx);

  return getBankReconciliationById(input.reconciliationId, ctx);
}

export async function removeBankStatementLine(
  lineId: string,
  ctx: ServiceContext,
): Promise<BankReconciliationView> {
  await assertBankReconciliationModules(ctx);
  assertCanEditBankReconciliation(ctx.roles);

  const preview = await prisma.bankStatementLine.findUnique({
    where: { id: lineId },
    include: { match: true, reconciliation: true },
  });
  if (!preview) throw new ServiceError("NOT_FOUND", "Línea de extracto no encontrada");
  if (preview.tenantId !== ctx.tenantId) {
    throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  }
  if (!EDITABLE_STATUSES.includes(preview.reconciliation.status as (typeof EDITABLE_STATUSES)[number])) {
    throw new ServiceError("CONFLICT", "No se pueden borrar líneas en este estado");
  }

  // Resolve auto-created movements before mutating match state.
  const autoMovements = await prisma.accountMovement.findMany({
    where: {
      tenantId: ctx.tenantId,
      sourceType: "MANUAL_ADJUSTMENT",
      sourceId: lineId,
      status: { in: ["CONFIRMED", "RECONCILED"] },
    },
    select: { id: true, status: true, type: true, companyId: true, movementDate: true },
  });
  if (autoMovements.some((m) => m.status === "RECONCILED" && !preview.match)) {
    throw new ServiceError(
      "CONFLICT",
      "Hay un movimiento conciliado ligado a esta línea. Desconciliá antes de borrarla.",
    );
  }

  // Block POSTED journals before unmatch/cancel; cancel DRAFT only after commit.
  for (const mov of autoMovements) {
    if (mov.companyId && (mov.type === "INFLOW" || mov.type === "OUTFLOW")) {
      await assertFinancialPeriodOpen({
        tenantId: ctx.tenantId,
        companyId: mov.companyId,
        date: mov.movementDate,
      });
      await assertJournalAllowsOperationalCancel(ctx, {
        companyId: mov.companyId,
        sourceType: mov.type === "INFLOW" ? "TREASURY_INFLOW" : "TREASURY_OUTFLOW",
        sourceId: mov.id,
        sourceLabel: "el movimiento de conciliación",
        enforceCompanyScope: false,
      });
    }
  }

  await prisma.$transaction(async (tx) => {
    const line = await tx.bankStatementLine.findUnique({
      where: { id: lineId },
      include: { match: true, reconciliation: true },
    });
    if (!line) throw new ServiceError("NOT_FOUND", "Línea de extracto no encontrada");
    if (!EDITABLE_STATUSES.includes(line.reconciliation.status as (typeof EDITABLE_STATUSES)[number])) {
      throw new ServiceError("CONFLICT", "No se pueden borrar líneas en este estado");
    }
    if (line.match) {
      await unmatchInTx(tx, line.match.id, ctx);
    }

    const stillReconciled = await tx.accountMovement.count({
      where: {
        tenantId: ctx.tenantId,
        sourceType: "MANUAL_ADJUSTMENT",
        sourceId: lineId,
        status: "RECONCILED",
      },
    });
    if (stillReconciled > 0) {
      throw new ServiceError(
        "CONFLICT",
        "Hay un movimiento conciliado ligado a esta línea. Desconciliá antes de borrarla.",
      );
    }

    await tx.accountMovement.updateMany({
      where: {
        tenantId: ctx.tenantId,
        sourceType: "MANUAL_ADJUSTMENT",
        sourceId: lineId,
        status: "CONFIRMED",
      },
      data: { status: "CANCELLED" },
    });

    await tx.bankStatementLine.delete({ where: { id: lineId } });
    await tx.bankReconciliation.update({
      where: { id: line.reconciliationId },
      data: { updatedBy: ctx.actorUserId },
    });
  });

  for (const mov of autoMovements) {
    if (mov.companyId && (mov.type === "INFLOW" || mov.type === "OUTFLOW")) {
      await cancelDraftJournalOnOperationalCancel(ctx, {
        companyId: mov.companyId,
        sourceType: mov.type === "INFLOW" ? "TREASURY_INFLOW" : "TREASURY_OUTFLOW",
        sourceId: mov.id,
        sourceLabel: "el movimiento de conciliación",
        enforceCompanyScope: false,
      });
    }
  }

  return getBankReconciliationById(preview.reconciliationId, ctx);
}

async function ensureInProgress(tx: TxClient, sessionId: string, ctx: ServiceContext) {
  // Row lock serializes match/close/cancel against the same session.
  await tx.$queryRaw`SELECT id FROM bank_reconciliations WHERE id = ${sessionId} FOR UPDATE`;

  const session = await tx.bankReconciliation.findUnique({ where: { id: sessionId } });
  if (!session) throw new ServiceError("NOT_FOUND", "Conciliación no encontrada");
  if (session.tenantId !== ctx.tenantId) {
    throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  }
  if (session.status === "DRAFT") {
    const flipped = await tx.bankReconciliation.updateMany({
      where: { id: sessionId, tenantId: ctx.tenantId, status: "DRAFT" },
      data: { status: "IN_PROGRESS", updatedBy: ctx.actorUserId },
    });
    assertOptimisticRowUpdate(
      flipped.count,
      "La conciliación ya no está en borrador. Recargá e intentá de nuevo.",
    );
    await auditTreasury(
      ctx,
      "bank_reconciliation.started",
      "BankReconciliation",
      sessionId,
      { companyId: session.companyId },
      { after: { status: "IN_PROGRESS" }, tx },
    );
    return { ...session, status: "IN_PROGRESS" as const };
  }
  if (session.status !== "IN_PROGRESS") {
    throw new ServiceError("CONFLICT", "La conciliación no admite emparejamientos en este estado");
  }
  return session;
}

async function markMovementReconciled(
  tx: TxClient,
  movementId: string,
  conflictMessage = "El movimiento ya no está confirmado. Recargá e intentá de nuevo.",
): Promise<void> {
  const flipped = await tx.accountMovement.updateMany({
    where: { id: movementId, status: "CONFIRMED" },
    data: { status: "RECONCILED" },
  });
  assertOptimisticRowUpdate(flipped.count, conflictMessage);
}

async function unmatchInTx(tx: TxClient, matchId: string, ctx: ServiceContext) {
  const match = await tx.bankReconciliationMatch.findUnique({
    where: { id: matchId },
    include: { reconciliation: true },
  });
  if (!match) throw new ServiceError("NOT_FOUND", "Emparejamiento no encontrado");
  if (match.tenantId !== ctx.tenantId) {
    throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  }
  if (!EDITABLE_STATUSES.includes(match.reconciliation.status as (typeof EDITABLE_STATUSES)[number])) {
    throw new ServiceError(
      "CONFLICT",
      "No se pueden deshacer matches en una conciliación cerrada o cancelada",
    );
  }

  await tx.bankReconciliationMatch.delete({ where: { id: matchId } });
  await tx.accountMovement.updateMany({
    where: { id: match.accountMovementId, status: "RECONCILED" },
    data: { status: "CONFIRMED" },
  });
  await auditTreasury(
    ctx,
    "account_movement.unreconciled",
    "AccountMovement",
    match.accountMovementId,
    { companyId: match.reconciliation.companyId },
    { after: { status: "CONFIRMED", reconciliationId: match.reconciliationId }, tx },
  );
}

export async function matchBankReconciliationLine(
  input: MatchBankReconciliationInput,
  ctx: ServiceContext,
): Promise<BankReconciliationView> {
  await assertBankReconciliationModules(ctx);
  assertCanEditBankReconciliation(ctx.roles);

  try {
    await prisma.$transaction(async (tx) => {
      const session = await ensureInProgress(tx, input.reconciliationId, ctx);

      const line = await tx.bankStatementLine.findUnique({
        where: { id: input.statementLineId },
        include: { match: true },
      });
      if (!line || line.reconciliationId !== session.id) {
        throw new ServiceError("NOT_FOUND", "Línea de extracto no encontrada en esta sesión");
      }
      if (line.match) {
        throw new ServiceError("CONFLICT", "La línea ya está emparejada");
      }

      const movement = await tx.accountMovement.findUnique({
        where: { id: input.accountMovementId },
      });
      if (!movement) throw new ServiceError("NOT_FOUND", "Movimiento no encontrado");
      if (movement.tenantId !== ctx.tenantId) {
        throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
      }
      if (movement.accountId !== session.accountId) {
        throw new ServiceError("CONFLICT", "El movimiento no pertenece a la cuenta de la conciliación");
      }
      if (movement.status !== "CONFIRMED") {
        throw new ServiceError(
          "CONFLICT",
          "Solo se pueden conciliar movimientos confirmados (no conciliados ni cancelados)",
        );
      }
      if (
        movement.movementDate < session.periodStart ||
        movement.movementDate > session.periodEnd
      ) {
        throw new ServiceError(
          "VALIDATION",
          "El movimiento está fuera del período de la conciliación",
        );
      }
      if (!movementMatchesDirection(movement.type, line.direction)) {
        throw new ServiceError(
          "VALIDATION",
          "La dirección del extracto no coincide con el tipo de movimiento",
        );
      }
      if (serializeMoneyDecimal(movement.amount) !== serializeMoneyDecimal(line.amount)) {
        throw new ServiceError("VALIDATION", "El monto del extracto no coincide con el movimiento");
      }

      await tx.bankReconciliationMatch.create({
        data: {
          tenantId: ctx.tenantId,
          reconciliationId: session.id,
          statementLineId: line.id,
          accountMovementId: movement.id,
          matchedBy: ctx.actorUserId,
        },
      });
      await markMovementReconciled(tx, movement.id);
      await tx.bankReconciliation.update({
        where: { id: session.id },
        data: { updatedBy: ctx.actorUserId },
      });
      await auditTreasury(
        ctx,
        "account_movement.reconciled",
        "AccountMovement",
        movement.id,
        { companyId: session.companyId },
        {
          after: {
            status: "RECONCILED",
            reconciliationId: session.id,
            statementLineId: line.id,
          },
          tx,
        },
      );
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ServiceError(
        "CONFLICT",
        "Ese movimiento o línea ya fue emparejado. Recargá e intentá de nuevo.",
      );
    }
    throw err;
  }

  return getBankReconciliationById(input.reconciliationId, ctx);
}

export async function unmatchBankReconciliationLine(
  matchId: string,
  ctx: ServiceContext,
): Promise<BankReconciliationView> {
  await assertBankReconciliationModules(ctx);
  assertCanEditBankReconciliation(ctx.roles);

  let reconciliationId = "";
  await prisma.$transaction(async (tx) => {
    const match = await tx.bankReconciliationMatch.findUnique({ where: { id: matchId } });
    if (!match) throw new ServiceError("NOT_FOUND", "Emparejamiento no encontrado");
    reconciliationId = match.reconciliationId;
    await unmatchInTx(tx, matchId, ctx);
    await tx.bankReconciliation.update({
      where: { id: reconciliationId },
      data: { updatedBy: ctx.actorUserId },
    });
  });

  return getBankReconciliationById(reconciliationId, ctx);
}

export async function closeBankReconciliation(
  id: string,
  ctx: ServiceContext,
): Promise<BankReconciliationView> {
  await assertBankReconciliationModules(ctx);
  assertCanEditBankReconciliation(ctx.roles);

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM bank_reconciliations WHERE id = ${id} FOR UPDATE`;
    const session = await loadSessionOrThrow(id, ctx, tx);
    if (session.status !== "IN_PROGRESS") {
      throw new ServiceError("CONFLICT", "Solo se puede cerrar una conciliación en progreso");
    }

    const credits = session.lines
      .filter((l) => l.direction === "CREDIT")
      .reduce((s, l) => s.plus(l.amount), new Prisma.Decimal(0));
    const debits = session.lines
      .filter((l) => l.direction === "DEBIT")
      .reduce((s, l) => s.plus(l.amount), new Prisma.Decimal(0));
    const implied = session.openingBalance.plus(credits).minus(debits);
    if (serializeMoneyDecimal(implied) !== serializeMoneyDecimal(session.closingBalance)) {
      throw new ServiceError(
        "VALIDATION",
        "El extracto no cuadra: saldo inicial + créditos − débitos debe igualar el saldo final declarado",
      );
    }

    const unmatched = session.lines.filter((l) => !l.match);
    if (unmatched.length > 0) {
      throw new ServiceError(
        "VALIDATION",
        `Hay ${unmatched.length} línea(s) de extracto sin emparejar`,
      );
    }

    const openBookMovements = await tx.accountMovement.count({
      where: {
        tenantId: ctx.tenantId,
        accountId: session.accountId,
        status: "CONFIRMED",
        movementDate: { gte: session.periodStart, lte: session.periodEnd },
      },
    });
    if (openBookMovements > 0) {
      throw new ServiceError(
        "VALIDATION",
        `Hay ${openBookMovements} movimiento(s) confirmado(s) sin conciliar en el período. Emparejalos o cancelalos antes de cerrar.`,
      );
    }

    const flipped = await tx.bankReconciliation.updateMany({
      where: { id, tenantId: ctx.tenantId, status: "IN_PROGRESS" },
      data: { status: "CLOSED", updatedBy: ctx.actorUserId },
    });
    assertOptimisticRowUpdate(
      flipped.count,
      "La conciliación ya no está en progreso. Recargá e intentá de nuevo.",
    );
    await auditTreasury(
      ctx,
      "bank_reconciliation.closed",
      "BankReconciliation",
      id,
      { companyId: session.companyId },
      { after: { status: "CLOSED" }, tx },
    );
  });

  return getBankReconciliationById(id, ctx);
}

/**
 * Formal reopen: CLOSED → IN_PROGRESS with mandatory reason ([D-032]/[D-080]).
 * Keeps existing matches / RECONCILED movements; editing unlocked again.
 */
export async function reopenBankReconciliation(
  input: ReopenBankReconciliationInput,
  ctx: ServiceContext,
): Promise<BankReconciliationView> {
  await assertBankReconciliationModules(ctx);
  assertCanEditBankReconciliation(ctx.roles);

  const reason = input.reason.trim();

  try {
    await prisma.$transaction(async (tx) => {
      const session = await tx.bankReconciliation.findUnique({ where: { id: input.reconciliationId } });
      if (!session) throw new ServiceError("NOT_FOUND", "Conciliación no encontrada");
      if (session.tenantId !== ctx.tenantId) {
        throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
      }
      if (session.status !== "CLOSED") {
        throw new ServiceError("CONFLICT", "Solo se puede reabrir una conciliación cerrada");
      }

      const otherOpen = await tx.bankReconciliation.findFirst({
        where: {
          tenantId: ctx.tenantId,
          accountId: session.accountId,
          status: { in: ["DRAFT", "IN_PROGRESS"] },
          id: { not: session.id },
        },
        select: { id: true },
      });
      if (otherOpen) {
        throw new ServiceError(
          "CONFLICT",
          "Ya hay otra conciliación abierta para esta cuenta. Cerrala o cancelala antes de reabrir.",
        );
      }

      const flipped = await tx.bankReconciliation.updateMany({
        where: { id: session.id, tenantId: ctx.tenantId, status: "CLOSED" },
        data: { status: "IN_PROGRESS", updatedBy: ctx.actorUserId },
      });
      assertOptimisticRowUpdate(
        flipped.count,
        "La conciliación ya no está cerrada. Recargá e intentá de nuevo.",
      );

      await auditTreasury(
        ctx,
        "bank_reconciliation.reopened",
        "BankReconciliation",
        session.id,
        { companyId: session.companyId },
        {
          before: { status: "CLOSED" },
          after: { status: "IN_PROGRESS", reason },
          tx,
        },
      );
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ServiceError(
        "CONFLICT",
        "Ya hay otra conciliación abierta para esta cuenta. Cerrala o cancelala antes de reabrir.",
      );
    }
    throw err;
  }

  return getBankReconciliationById(input.reconciliationId, ctx);
}

export async function cancelBankReconciliation(
  id: string,
  ctx: ServiceContext,
  opts?: { reason?: string | null },
): Promise<BankReconciliationView> {
  await assertBankReconciliationModules(ctx);
  assertCanEditBankReconciliation(ctx.roles);

  const reason = opts?.reason?.trim() || null;

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM bank_reconciliations WHERE id = ${id} FOR UPDATE`;
    const session = await tx.bankReconciliation.findUnique({ where: { id } });
    if (!session) throw new ServiceError("NOT_FOUND", "Conciliación no encontrada");
    if (session.tenantId !== ctx.tenantId) {
      throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    }
    if (session.status === "CANCELLED") {
      throw new ServiceError("CONFLICT", "La conciliación ya está cancelada");
    }
    if (session.status === "CLOSED" && (!reason || reason.length < 3)) {
      throw new ServiceError(
        "VALIDATION",
        "Cancelar una conciliación cerrada requiere un motivo (mín. 3 caracteres)",
      );
    }

    const flipped = await tx.bankReconciliation.updateMany({
      where: { id, tenantId: ctx.tenantId, status: session.status },
      data: { status: "CANCELLED", updatedBy: ctx.actorUserId },
    });
    assertOptimisticRowUpdate(
      flipped.count,
      "La conciliación cambió de estado. Recargá e intentá de nuevo.",
    );

    // Re-query after the status claim so concurrent matches cannot leave orphan RECONCILED rows.
    const matches = await tx.bankReconciliationMatch.findMany({
      where: { reconciliationId: id },
      select: { accountMovementId: true },
    });
    for (const match of matches) {
      await tx.accountMovement.updateMany({
        where: { id: match.accountMovementId, status: "RECONCILED" },
        data: { status: "CONFIRMED" },
      });
      await auditTreasury(
        ctx,
        "account_movement.unreconciled",
        "AccountMovement",
        match.accountMovementId,
        { companyId: session.companyId },
        { after: { status: "CONFIRMED", reconciliationId: id, reason: "session_cancelled" }, tx },
      );
    }

    await tx.bankReconciliationMatch.deleteMany({ where: { reconciliationId: id } });
    await auditTreasury(
      ctx,
      "bank_reconciliation.cancelled",
      "BankReconciliation",
      id,
      { companyId: session.companyId },
      { after: { status: "CANCELLED", reason, previousStatus: session.status }, tx },
    );
  });

  return getBankReconciliationById(id, ctx);
}
