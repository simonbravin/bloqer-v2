import { Prisma, prisma } from "@bloqer/database";
import { assertOverheadCompanyScope, assertOverheadEdit, assertOverheadView } from "./overhead-access";
import {
  AUTO_WEIGHT_PERIOD_CLOSE_OPTS,
  getAutoWeightOverheadPreviewForPeriod,
  listCorporateGgPeriods,
} from "./overhead-auto-weight.service";
import { getCompanyOverheadSettings } from "./project-overhead.service";
import { assertValidOverheadPeriod, currentOverheadPeriod } from "./overhead-period";
import { ServiceContext, ServiceError } from "../types";

export type OverheadPeriodSummary = {
  period: string;
  status: "OPEN" | "FROZEN";
  poolArs: string;
  totalCdArs: string;
  invoiceCount: number;
  excludedNonArsCount: number;
  projectRowCount: number;
  frozenAt: string | null;
};

export async function getOverheadPeriodCloseStatus(
  companyId: string,
  period: string,
  ctx: ServiceContext,
): Promise<"OPEN" | "FROZEN"> {
  assertOverheadView(ctx);
  assertOverheadCompanyScope(companyId, ctx);
  const row = await prisma.overheadPeriodClose.findUnique({
    where: {
      tenantId_companyId_period: {
        tenantId: ctx.tenantId,
        companyId,
        period,
      },
    },
    select: { status: true },
  });
  return row?.status === "FROZEN" ? "FROZEN" : "OPEN";
}

export async function listOverheadPeriodSummaries(
  companyId: string,
  ctx: ServiceContext,
  opts?: { limit?: number },
): Promise<OverheadPeriodSummary[]> {
  assertOverheadView(ctx);
  assertOverheadCompanyScope(companyId, ctx);
  const settings = await getCompanyOverheadSettings(companyId, ctx);
  if (settings.overheadAllocationMode !== "AUTO_WEIGHT") {
    return [];
  }

  const limit = opts?.limit ?? 12;
  const [corporatePeriods, frozenCloses] = await Promise.all([
    listCorporateGgPeriods(companyId, ctx),
    prisma.overheadPeriodClose.findMany({
      where: {
        tenantId: ctx.tenantId,
        companyId,
        status: "FROZEN",
      },
      select: { period: true },
    }),
  ]);

  const periodSet = new Set<string>([
    ...corporatePeriods,
    ...frozenCloses.map((c) => c.period),
    currentOverheadPeriod(),
  ]);
  const sorted = [...periodSet].sort((a, b) => b.localeCompare(a));
  const slice = sorted.slice(0, limit);

  const [closes, snapshotCounts] = await Promise.all([
    prisma.overheadPeriodClose.findMany({
      where: {
        tenantId: ctx.tenantId,
        companyId,
        period: { in: slice },
      },
    }),
    prisma.overheadAutoPeriodSnapshot.groupBy({
      by: ["period"],
      where: {
        tenantId: ctx.tenantId,
        companyId,
        period: { in: slice },
      },
      _count: { _all: true },
    }),
  ]);
  const closeByPeriod = new Map(closes.map((c) => [c.period, c]));
  const snapshotCountByPeriod = new Map(snapshotCounts.map((g) => [g.period, g._count._all]));

  const openPeriods = slice.filter((p) => closeByPeriod.get(p)?.status !== "FROZEN");
  const openPreviews = await Promise.all(
    openPeriods.map(async (period) => {
      const preview = await getAutoWeightOverheadPreviewForPeriod(
        companyId,
        period,
        ctx,
        AUTO_WEIGHT_PERIOD_CLOSE_OPTS,
      );
      return { period, preview };
    }),
  );
  const previewByPeriod = new Map(openPreviews.map((p) => [p.period, p.preview]));

  const summaries: OverheadPeriodSummary[] = [];

  for (const period of slice) {
    const close = closeByPeriod.get(period);
    if (close?.status === "FROZEN") {
      summaries.push({
        period,
        status: "FROZEN",
        poolArs: close.poolArs.toFixed(2),
        totalCdArs: close.totalCdArs.toFixed(2),
        invoiceCount: 0,
        excludedNonArsCount: 0,
        projectRowCount: snapshotCountByPeriod.get(period) ?? 0,
        frozenAt: close.frozenAt?.toISOString() ?? null,
      });
      continue;
    }

    const preview = previewByPeriod.get(period);
    if (!preview) continue;

    summaries.push({
      period,
      status: "OPEN",
      poolArs: preview.poolArs,
      totalCdArs: preview.totalAccruedCd,
      invoiceCount: preview.invoiceCount,
      excludedNonArsCount: preview.excludedNonArsCount,
      projectRowCount: preview.rows.length,
      frozenAt: null,
    });
  }

  return summaries;
}

export async function closeOverheadPeriod(
  companyId: string,
  period: string,
  ctx: ServiceContext,
): Promise<void> {
  assertOverheadEdit(ctx);
  assertOverheadCompanyScope(companyId, ctx);
  assertValidOverheadPeriod(period);

  const settings = await getCompanyOverheadSettings(companyId, ctx);
  if (settings.overheadAllocationMode !== "AUTO_WEIGHT") {
    throw new ServiceError(
      "CONFLICT",
      "Solo se puede cerrar períodos en modo de imputación automática por peso del CD",
    );
  }

  const existing = await prisma.overheadPeriodClose.findUnique({
    where: {
      tenantId_companyId_period: {
        tenantId: ctx.tenantId,
        companyId,
        period,
      },
    },
  });
  if (existing?.status === "FROZEN") {
    throw new ServiceError("CONFLICT", "El período ya está cerrado. Reabrilo antes de volver a cerrar.");
  }

  const preview = await getAutoWeightOverheadPreviewForPeriod(
    companyId,
    period,
    ctx,
    AUTO_WEIGHT_PERIOD_CLOSE_OPTS,
  );

  const pool = new Prisma.Decimal(preview.poolArs);
  const totalCd = new Prisma.Decimal(preview.totalAccruedCd);

  if (pool.greaterThan(0) && totalCd.lessThanOrEqualTo(0)) {
    throw new ServiceError(
      "CONFLICT",
      "No se puede cerrar: hay gastos corporativos en el período pero ningún proyecto con costo devengado",
    );
  }

  await prisma.$transaction(async (tx) => {
    const periodClose = await tx.overheadPeriodClose.upsert({
      where: {
        tenantId_companyId_period: {
          tenantId: ctx.tenantId,
          companyId,
          period,
        },
      },
      create: {
        tenantId: ctx.tenantId,
        companyId,
        period,
        status: "FROZEN",
        poolArs: pool,
        totalCdArs: totalCd,
        frozenAt: new Date(),
        frozenBy: ctx.actorUserId,
      },
      update: {
        status: "FROZEN",
        poolArs: pool,
        totalCdArs: totalCd,
        frozenAt: new Date(),
        frozenBy: ctx.actorUserId,
      },
    });

    await tx.overheadAutoPeriodSnapshot.deleteMany({
      where: { periodCloseId: periodClose.id },
    });

    if (preview.rows.length > 0) {
      await tx.overheadAutoPeriodSnapshot.createMany({
        data: preview.rows.map((row) => ({
          tenantId: ctx.tenantId,
          companyId,
          period,
          projectId: row.projectId,
          periodCloseId: periodClose.id,
          allocatedAmount: new Prisma.Decimal(row.allocatedAmount),
          weightPct: new Prisma.Decimal(row.weightPct),
        })),
      });
    }
  });
}

export async function reopenOverheadPeriod(
  companyId: string,
  period: string,
  ctx: ServiceContext,
): Promise<void> {
  assertOverheadEdit(ctx);
  assertOverheadCompanyScope(companyId, ctx);
  assertValidOverheadPeriod(period);

  const existing = await prisma.overheadPeriodClose.findUnique({
    where: {
      tenantId_companyId_period: {
        tenantId: ctx.tenantId,
        companyId,
        period,
      },
    },
  });
  if (!existing || existing.status !== "FROZEN") {
    throw new ServiceError("CONFLICT", "El período no está cerrado");
  }

  await prisma.$transaction(async (tx) => {
    await tx.overheadAutoPeriodSnapshot.deleteMany({
      where: {
        tenantId: ctx.tenantId,
        companyId,
        period,
      },
    });
    await tx.overheadPeriodClose.update({
      where: { id: existing.id },
      data: {
        status: "OPEN",
        frozenAt: null,
        frozenBy: null,
      },
    });
  });
}

/** Período calendario actual con estado (para banner en UI). */
export async function getCurrentPeriodOverheadSummary(
  companyId: string,
  ctx: ServiceContext,
): Promise<OverheadPeriodSummary | null> {
  const settings = await getCompanyOverheadSettings(companyId, ctx);
  if (settings.overheadAllocationMode !== "AUTO_WEIGHT") return null;
  const period = currentOverheadPeriod();
  const list = await listOverheadPeriodSummaries(companyId, ctx, { limit: 24 });
  return list.find((p) => p.period === period) ?? null;
}
