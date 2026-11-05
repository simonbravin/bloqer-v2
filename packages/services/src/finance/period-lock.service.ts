import { prisma, type Prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { toIsoDateInTimeZone } from "@bloqer/utils";
import { closePeriodSchema, reopenPeriodSchema, type ClosePeriodInput, type ReopenPeriodInput } from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { lockAccountingCompany, resolveAccountingCompanyId } from "../accounting/accounting-company-context";
import { assertTenantModuleEnabled } from "../tenant-modules/tenant-module.service";
import { ServiceContext, ServiceError } from "../types";
import { assertOptimisticRowUpdate } from "./optimistic-lock";
import {
  assertValidOverheadPeriod,
  periodToDateRange,
} from "./overhead-period";

type DbClient = Prisma.TransactionClient | typeof prisma;

export type PeriodSummary = {
  periodKey: string;
  startDate: string;
  endDate: string;
  status: "OPEN" | "CLOSED";
  closedAt: string | null;
  closedByUserId: string | null;
  lastReopenReason: string | null;
  lastReopenedAt: string | null;
};

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function normalizeIsoDate(date: Date | string): string {
  if (date instanceof Date && Number.isFinite(date.getTime())) return toIsoDate(date);
  if (typeof date === "string") {
    const iso = date.slice(0, 10);
    const day = new Date(`${iso}T00:00:00.000Z`);
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso) && Number.isFinite(day.getTime()) && toIsoDate(day) === iso) {
      return iso;
    }
  }
  throw new ServiceError("VALIDATION", "Fecha inválida para validación de período");
}

function assertCanOperatePeriodClose(ctx: ServiceContext): void {
  if (!can(ctx.roles, "APPROVE", "PERIOD_CLOSE")) {
    throw new ServiceError("FORBIDDEN", "Solo OWNER o ADMIN pueden cerrar o reabrir períodos");
  }
}

async function assertPeriodCloseModule(ctx: ServiceContext): Promise<void> {
  await assertTenantModuleEnabled(ctx, "PERIOD_CLOSE");
}

async function lockPeriodCompany(tx: Prisma.TransactionClient, tenantId: string, companyId: string): Promise<void> {
  await lockAccountingCompany(tx, tenantId, companyId);
  const activeCompany = await tx.company.findFirst({
    where: { id: companyId, tenantId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!activeCompany) throw new ServiceError("VALIDATION", "Empresa no válida o inactiva");
}

/**
 * Blocks create/edit/cancel of treasury movements and journal entries when the
 * calendar date falls in a CLOSED period for the company ([D-014]/[D-078]).
 * No-op when `companyId` is null (legacy rows without company scope).
 * Callers that own a treasury/GL company must resolve and pass companyId —
 * do not rely on this no-op for new money paths.
 */
export async function assertFinancialPeriodOpen(
  params: {
    tenantId: string;
    companyId: string | null | undefined;
    date: Date | string;
  },
  db: DbClient = prisma,
): Promise<void> {
  const companyId = params.companyId?.trim() || null;
  if (!companyId) return;

  const iso = normalizeIsoDate(params.date);
  const day = new Date(`${iso}T00:00:00.000Z`);

  const closed = await db.period.findFirst({
    where: {
      tenantId: params.tenantId,
      companyId,
      status: "CLOSED",
      startDate: { lte: day },
      endDate: { gte: day },
    },
    select: { periodKey: true },
  });

  if (closed) {
    throw new ServiceError(
      "CONFLICT",
      `PERIOD_CLOSED: El período ${closed.periodKey} está cerrado. Reabrilo para registrar o modificar movimientos/asientos en esa fecha.`,
    );
  }
}

export async function listFinancialPeriods(
  companyIdInput: string | null | undefined,
  ctx: ServiceContext,
  opts?: { limit?: number },
): Promise<PeriodSummary[]> {
  await assertPeriodCloseModule(ctx);
  if (!can(ctx.roles, "VIEW", "PERIOD_CLOSE")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver cierres de período");
  }

  const limit = opts?.limit ?? 12;
  if (!Number.isInteger(limit) || limit < 1 || limit > 36) {
    throw new ServiceError("VALIDATION", "Indicá entre 1 y 36 períodos para consultar");
  }
  const companyId = await resolveAccountingCompanyId(ctx, companyIdInput ?? null);

  const closedRows = await prisma.period.findMany({
    where: { tenantId: ctx.tenantId, companyId },
    orderBy: { periodKey: "desc" },
    take: limit,
  });

  const today = toIsoDateInTimeZone();
  const monthStart = new Date(`${today.slice(0, 7)}-01T00:00:00.000Z`);
  const keys = new Set<string>(closedRows.map((r) => r.periodKey));
  // Include recent months even if never closed.
  {
    for (let i = 0; i < limit; i++) {
      const d = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() - i, 1));
      keys.add(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
    }
  }

  const sorted = [...keys].sort((a, b) => b.localeCompare(a)).slice(0, limit);
  const byKey = new Map(closedRows.map((r) => [r.periodKey, r]));

  return sorted.map((periodKey) => {
    const row = byKey.get(periodKey);
    const range = periodToDateRange(periodKey);
    return {
      periodKey,
      startDate: row ? toIsoDate(row.startDate) : range.dateFrom,
      endDate: row ? toIsoDate(row.endDate) : range.dateTo,
      status: row?.status === "CLOSED" ? "CLOSED" : "OPEN",
      closedAt: row?.closedAt?.toISOString() ?? null,
      closedByUserId: row?.closedByUserId ?? null,
      lastReopenReason: row?.lastReopenReason ?? null,
      lastReopenedAt: row?.lastReopenedAt?.toISOString() ?? null,
    };
  });
}

export async function closeFinancialPeriod(
  input: ClosePeriodInput,
  ctx: ServiceContext,
): Promise<PeriodSummary> {
  await assertPeriodCloseModule(ctx);
  assertCanOperatePeriodClose(ctx);
  const parsed = closePeriodSchema.safeParse(input);
  if (!parsed.success) throw new ServiceError("VALIDATION", parsed.error.issues[0]?.message ?? "Cierre inválido");
  assertValidOverheadPeriod(parsed.data.periodKey);

  const companyId = await resolveAccountingCompanyId(ctx, input.companyId);
  const range = periodToDateRange(input.periodKey);
  const startDate = new Date(`${range.dateFrom}T00:00:00.000Z`);
  const endDate = new Date(`${range.dateTo}T00:00:00.000Z`);
  const now = new Date();

  const row = await prisma.$transaction(async (tx) => {
    // Serialize vs journal post / treasury writes that lock the same company row.
    await lockPeriodCompany(tx, ctx.tenantId, companyId);

    const existing = await tx.period.findUnique({
      where: {
        tenantId_companyId_periodKey: {
          tenantId: ctx.tenantId,
          companyId,
          periodKey: input.periodKey,
        },
      },
    });
    if (existing?.status === "CLOSED") {
      throw new ServiceError("CONFLICT", `El período ${input.periodKey} ya está cerrado`);
    }

    let saved;
    if (existing) {
      const flipped = await tx.period.updateMany({
        where: { id: existing.id, tenantId: ctx.tenantId, status: "OPEN" },
        data: {
          startDate,
          endDate,
          status: "CLOSED",
          closedAt: now,
          closedByUserId: ctx.actorUserId,
        },
      });
      assertOptimisticRowUpdate(
        flipped.count,
        `El período ${input.periodKey} ya fue cerrado o modificado. Recargá e intentá de nuevo.`,
      );
      saved = await tx.period.findUniqueOrThrow({ where: { id: existing.id } });
    } else {
      saved = await tx.period.create({
        data: {
          tenantId: ctx.tenantId,
          companyId,
          periodKey: input.periodKey,
          startDate,
          endDate,
          status: "CLOSED",
          closedAt: now,
          closedByUserId: ctx.actorUserId,
        },
      });
    }

    await log(
      {
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId,
        action: "period.closed",
        entityType: "Period",
        entityId: saved.id,
        companyId,
        after: {
          periodKey: saved.periodKey,
          startDate: range.dateFrom,
          endDate: range.dateTo,
          status: "CLOSED",
        },
        ipAddress: ctx.ipAddress,
      },
      tx,
    );

    return saved;
  });

  return {
    periodKey: row.periodKey,
    startDate: toIsoDate(row.startDate),
    endDate: toIsoDate(row.endDate),
    status: "CLOSED",
    closedAt: row.closedAt?.toISOString() ?? null,
    closedByUserId: row.closedByUserId,
    lastReopenReason: row.lastReopenReason,
    lastReopenedAt: row.lastReopenedAt?.toISOString() ?? null,
  };
}

export async function reopenFinancialPeriod(
  input: ReopenPeriodInput,
  ctx: ServiceContext,
): Promise<PeriodSummary> {
  await assertPeriodCloseModule(ctx);
  assertCanOperatePeriodClose(ctx);
  const parsed = reopenPeriodSchema.safeParse(input);
  if (!parsed.success) throw new ServiceError("VALIDATION", parsed.error.issues[0]?.message ?? "Reapertura inválida");
  assertValidOverheadPeriod(parsed.data.periodKey);

  const companyId = await resolveAccountingCompanyId(ctx, input.companyId);
  const reason = parsed.data.reason;
  const now = new Date();

  const row = await prisma.$transaction(async (tx) => {
    await lockPeriodCompany(tx, ctx.tenantId, companyId);

    const existing = await tx.period.findUnique({
      where: {
        tenantId_companyId_periodKey: {
          tenantId: ctx.tenantId,
          companyId,
          periodKey: input.periodKey,
        },
      },
    });
    if (!existing || existing.status !== "CLOSED") {
      throw new ServiceError("CONFLICT", `El período ${input.periodKey} no está cerrado`);
    }

    const flipped = await tx.period.updateMany({
      where: { id: existing.id, tenantId: ctx.tenantId, status: "CLOSED" },
      data: {
        status: "OPEN",
        lastReopenReason: reason,
        lastReopenedAt: now,
        lastReopenedByUserId: ctx.actorUserId,
      },
    });
    assertOptimisticRowUpdate(
      flipped.count,
      `El período ${input.periodKey} ya no está cerrado. Recargá e intentá de nuevo.`,
    );

    const saved = await tx.period.findUniqueOrThrow({ where: { id: existing.id } });

    await log(
      {
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId,
        action: "period.reopened",
        entityType: "Period",
        entityId: saved.id,
        companyId,
        before: { status: "CLOSED", periodKey: existing.periodKey },
        after: { status: "OPEN", periodKey: saved.periodKey, reason },
        ipAddress: ctx.ipAddress,
      },
      tx,
    );

    return saved;
  });

  return {
    periodKey: row.periodKey,
    startDate: toIsoDate(row.startDate),
    endDate: toIsoDate(row.endDate),
    status: "OPEN",
    closedAt: row.closedAt?.toISOString() ?? null,
    closedByUserId: row.closedByUserId,
    lastReopenReason: row.lastReopenReason,
    lastReopenedAt: row.lastReopenedAt?.toISOString() ?? null,
  };
}
