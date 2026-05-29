import { Prisma, prisma } from "@bloqer/database";
import { getProjectAccruedByMonth } from "../cost-control/project-accrued-aggregation";
import { ServiceContext, ServiceError } from "../types";
import { assertOverheadView } from "./overhead-access";
import {
  assertValidOverheadPeriod,
  computeWeightShare,
  currentOverheadPeriod,
  periodToDateRange,
  resolvePeriodKeysForFilter,
  type OverheadPeriodFilter,
} from "./overhead-period";

const ZERO = new Prisma.Decimal(0);
const MAX_CORPORATE_GG_PERIODS = 120;

export type CorporateGgPoolResult = {
  poolArs: string;
  invoiceCount: number;
  excludedNonArsCount: number;
};

/** Facturas proveedor corporativas emitidas en el mes (pool GG a prorratear). */
export async function getCorporateGgPoolForPeriod(
  companyId: string,
  period: string,
  ctx: ServiceContext,
): Promise<CorporateGgPoolResult> {
  assertValidOverheadPeriod(period);
  const { dateFrom, dateTo } = periodToDateRange(period);

  const invoices = await prisma.supplierInvoice.findMany({
    where: {
      tenantId: ctx.tenantId,
      companyId,
      projectId: null,
      status: "ISSUED",
      issueDate: { gte: new Date(dateFrom), lte: new Date(dateTo) },
    },
    select: { totalAmount: true, amountArs: true, currency: true },
  });

  let pool = ZERO;
  let excludedNonArsCount = 0;
  for (const inv of invoices) {
    if (inv.amountArs.greaterThan(0)) {
      pool = pool.plus(inv.amountArs);
    } else if (inv.currency === "ARS") {
      pool = pool.plus(inv.totalAmount);
    } else {
      excludedNonArsCount += 1;
    }
  }

  return {
    poolArs: pool.toFixed(2),
    invoiceCount: invoices.length,
    excludedNonArsCount,
  };
}

async function listCompanyProjectsForAutoWeight(
  companyId: string,
  ctx: ServiceContext,
): Promise<{ id: string; code: string; name: string }[]> {
  return prisma.project.findMany({
    where: {
      tenantId: ctx.tenantId,
      companyId,
      status: { in: ["ACTIVE", "ON_HOLD", "DRAFT"] },
    },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  });
}

/** Períodos YYYY-MM con al menos una factura corporativa emitida (máx. 120). */
export async function listCorporateGgPeriods(
  companyId: string,
  ctx: ServiceContext,
): Promise<string[]> {
  const invoices = await prisma.supplierInvoice.findMany({
    where: {
      tenantId: ctx.tenantId,
      companyId,
      projectId: null,
      status: "ISSUED",
    },
    select: { issueDate: true },
    orderBy: { issueDate: "asc" },
    take: 5001,
  });

  const keys = new Set<string>();
  for (const inv of invoices) {
    const d = inv.issueDate;
    keys.add(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  if (keys.size > MAX_CORPORATE_GG_PERIODS || invoices.length > 5000) {
    throw new ServiceError(
      "VALIDATION",
      `Demasiados períodos con gastos corporativos (máx. ${MAX_CORPORATE_GG_PERIODS}). Usá un filtro de fechas en el reporte.`,
    );
  }
  return [...keys].sort();
}

export type AutoWeightProjectRow = {
  projectId: string;
  projectCode: string;
  projectName: string;
  accruedCd: string;
  weightPct: string;
  allocatedAmount: string;
};

export type AutoWeightPeriodPreview = {
  period: string;
  poolArs: string;
  invoiceCount: number;
  excludedNonArsCount: number;
  totalAccruedCd: string;
  rows: AutoWeightProjectRow[];
  warnings: string[];
};

type AutoWeightPeriodContext = {
  period: string;
  pool: Prisma.Decimal;
  poolArs: string;
  invoiceCount: number;
  excludedNonArsCount: number;
  totalCd: Prisma.Decimal;
  cdsByProjectId: Map<string, Prisma.Decimal>;
  projects: { id: string; code: string; name: string }[];
  warnings: string[];
};

async function projectAccruedCdForPeriod(
  projectId: string,
  period: string,
  ctx: ServiceContext,
): Promise<Prisma.Decimal> {
  const { dateFrom, dateTo } = periodToDateRange(period);
  const { total } = await getProjectAccruedByMonth(projectId, { dateFrom, dateTo }, ctx);
  return total;
}

async function buildAutoWeightPeriodContext(
  companyId: string,
  period: string,
  ctx: ServiceContext,
): Promise<AutoWeightPeriodContext> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { tenantId: true },
  });
  if (!company) throw new ServiceError("NOT_FOUND", "Empresa no encontrada");
  if (company.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const [poolResult, projects] = await Promise.all([
    getCorporateGgPoolForPeriod(companyId, period, ctx),
    listCompanyProjectsForAutoWeight(companyId, ctx),
  ]);

  const warnings: string[] = [];
  if (poolResult.excludedNonArsCount > 0) {
    warnings.push(
      `${poolResult.excludedNonArsCount} factura(s) corporativa(s) en moneda extranjera sin amountArs — no sumadas al pool.`,
    );
  }

  const pool = new Prisma.Decimal(poolResult.poolArs);
  const cdsByProjectId = new Map<string, Prisma.Decimal>();
  const cdEntries = await Promise.all(
    projects.map(async (p) => ({
      projectId: p.id,
      cd: await projectAccruedCdForPeriod(p.id, period, ctx),
    })),
  );
  let totalCd = ZERO;
  for (const { projectId, cd } of cdEntries) {
    cdsByProjectId.set(projectId, cd);
    totalCd = totalCd.plus(cd);
  }

  if (totalCd.isZero() && pool.greaterThan(0)) {
    warnings.push(
      "Hay gastos corporativos en el período pero ningún proyecto con costo devengado — no se puede prorratear.",
    );
  }

  return {
    period,
    pool,
    poolArs: poolResult.poolArs,
    invoiceCount: poolResult.invoiceCount,
    excludedNonArsCount: poolResult.excludedNonArsCount,
    totalCd,
    cdsByProjectId,
    projects,
    warnings,
  };
}

function allocateProjectFromContext(
  context: AutoWeightPeriodContext,
  projectId: string,
): { allocatedAmount: string; weightPct: string } {
  const cd = context.cdsByProjectId.get(projectId) ?? ZERO;
  const weight = context.totalCd.isZero() ? ZERO : cd.div(context.totalCd);
  return {
    allocatedAmount: context.pool.times(weight).toFixed(2),
    weightPct: computeWeightShare(cd.toFixed(2), context.totalCd.toFixed(2)),
  };
}

export async function getAutoWeightOverheadPreviewForPeriod(
  companyId: string,
  period: string,
  ctx: ServiceContext,
): Promise<AutoWeightPeriodPreview> {
  assertOverheadView(ctx);
  assertValidOverheadPeriod(period);
  const context = await buildAutoWeightPeriodContext(companyId, period, ctx);

  const rows: AutoWeightProjectRow[] = context.projects.map((p) => {
    const cd = context.cdsByProjectId.get(p.id) ?? ZERO;
    const { allocatedAmount, weightPct } = allocateProjectFromContext(context, p.id);
    return {
      projectId: p.id,
      projectCode: p.code,
      projectName: p.name,
      accruedCd: cd.toFixed(2),
      weightPct,
      allocatedAmount,
    };
  });

  return {
    period: context.period,
    poolArs: context.poolArs,
    invoiceCount: context.invoiceCount,
    excludedNonArsCount: context.excludedNonArsCount,
    totalAccruedCd: context.totalCd.toFixed(2),
    rows,
    warnings: context.warnings,
  };
}

async function resolveAutoWeightPeriodKeys(
  companyId: string,
  periodFilter: OverheadPeriodFilter | undefined,
  ctx: ServiceContext,
): Promise<string[]> {
  if (periodFilter?.periodFrom || periodFilter?.periodTo) {
    return resolvePeriodKeysForFilter(periodFilter);
  }
  const corporate = await listCorporateGgPeriods(companyId, ctx);
  return corporate.length > 0 ? corporate : [currentOverheadPeriod()];
}

export async function sumAutoWeightOverheadForProject(
  projectId: string,
  companyId: string,
  periodFilter: OverheadPeriodFilter | undefined,
  ctx: ServiceContext,
): Promise<{
  amount: Prisma.Decimal;
  weightPctDisplay: string | null;
  poolArsTotal: string;
  periods: string[];
  warnings: string[];
}> {
  const periods = await resolveAutoWeightPeriodKeys(companyId, periodFilter, ctx);
  let total = ZERO;
  let poolSum = ZERO;
  const warnings: string[] = [];
  let lastWeight: string | null = null;

  for (const period of periods) {
    const context = await buildAutoWeightPeriodContext(companyId, period, ctx);
    const { allocatedAmount, weightPct } = allocateProjectFromContext(context, projectId);
    total = total.plus(new Prisma.Decimal(allocatedAmount));
    poolSum = poolSum.plus(context.pool);
    if (periods.length === 1) lastWeight = weightPct;
    warnings.push(...context.warnings);
  }

  return {
    amount: total,
    weightPctDisplay: lastWeight,
    poolArsTotal: poolSum.toFixed(2),
    periods,
    warnings: [...new Set(warnings)],
  };
}
