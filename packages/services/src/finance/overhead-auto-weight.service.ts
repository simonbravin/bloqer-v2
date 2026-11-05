import { Prisma, prisma } from "@bloqer/database";
import { loadCompanyAccruedForOverhead } from "../cost-control/project-accrued-aggregation";
import { ServiceContext, ServiceError } from "../types";
import { assertOverheadCompanyScope, assertOverheadEdit, assertOverheadView } from "./overhead-access";
import { assertApTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { verifiedDocumentAmountArs } from "./fx-amount.service";
import { serializeMoneyDecimal } from "./money-decimal";
import { requireProjectAccess, resolveAccessibleProjectScope } from "../security/access";
import {
  assertValidOverheadPeriod,
  computeWeightShare,
  currentOverheadPeriod,
  periodToDateRange,
  periodToIssueDateBounds,
  resolvePeriodKeysForFilter,
  type OverheadPeriodFilter,
} from "./overhead-period";

/** Opciones alineadas con D-043 al cerrar período o mostrar vista previa de cierre. */
export const AUTO_WEIGHT_PERIOD_CLOSE_OPTS = { excludeDraftProjects: true } as const;

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
  db: Prisma.TransactionClient = prisma,
): Promise<CorporateGgPoolResult> {
  assertOverheadView(ctx);
  assertOverheadCompanyScope(companyId, ctx);
  assertValidOverheadPeriod(period);
  const issueDate = periodToIssueDateBounds(period);

  const invoices = await db.supplierInvoice.findMany({
    where: {
      tenantId: ctx.tenantId,
      companyId,
      company: { tenantId: ctx.tenantId },
      projectId: null,
      status: "ISSUED",
      issueDate,
    },
    select: { totalAmount: true, amountArs: true, fxRate: true, currency: true, documentKind: true },
  });

  let pool = ZERO;
  let excludedNonArsCount = 0;
  for (const inv of invoices) {
    const equivalent = verifiedDocumentAmountArs(inv, inv.totalAmount);
    if (equivalent === null) excludedNonArsCount += 1;
    else pool = pool.plus(inv.documentKind === "CREDIT_NOTE" ? equivalent.negated() : equivalent);
  }

  return {
    poolArs: serializeMoneyDecimal(pool),
    invoiceCount: invoices.length,
    excludedNonArsCount,
  };
}

type AutoWeightProjectListOpts = { excludeDraftProjects?: boolean };

async function listCompanyProjectsForAutoWeight(
  companyId: string,
  ctx: ServiceContext,
  opts?: AutoWeightProjectListOpts,
  db: Prisma.TransactionClient = prisma,
): Promise<{ id: string; code: string; name: string }[]> {
  const statuses = opts?.excludeDraftProjects
    ? (["ACTIVE", "ON_HOLD"] as const)
    : (["ACTIVE", "ON_HOLD", "DRAFT"] as const);
  return db.project.findMany({
    where: {
      tenantId: ctx.tenantId,
      companyId,
      company: { tenantId: ctx.tenantId },
      status: { in: [...statuses] },
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
  assertOverheadView(ctx);
  assertOverheadCompanyScope(companyId, ctx);
  const invoices = await prisma.supplierInvoice.findMany({
    where: {
      tenantId: ctx.tenantId,
      companyId,
      company: { tenantId: ctx.tenantId },
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
  accruedCd: string | null;
  weightPct: string | null;
  allocatedAmount: string | null;
};

export type AutoWeightPeriodPreview = {
  period: string;
  poolArs: string;
  invoiceCount: number;
  excludedNonArsCount: number;
  totalAccruedCd: string | null;
  calculationBlocked: boolean;
  projectCount: number;
  rows: AutoWeightProjectRow[];
  warnings: string[];
};

type AutoWeightPeriodContext = {
  period: string;
  pool: Prisma.Decimal;
  poolArs: string;
  invoiceCount: number;
  excludedNonArsCount: number;
  totalCd: Prisma.Decimal | null;
  calculationBlocked: boolean;
  cdsByProjectId: Map<string, Prisma.Decimal | null>;
  projects: { id: string; code: string; name: string }[];
  warnings: string[];
};

export type BuildAutoWeightContextOpts = AutoWeightProjectListOpts;

async function buildAutoWeightPeriodContext(
  companyId: string,
  period: string,
  ctx: ServiceContext,
  opts?: BuildAutoWeightContextOpts,
  db: Prisma.TransactionClient = prisma,
): Promise<AutoWeightPeriodContext> {
  assertOverheadCompanyScope(companyId, ctx);
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { tenantId: true },
  });
  if (!company) throw new ServiceError("NOT_FOUND", "Empresa no encontrada");
  if (company.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const [poolResult, projects] = await Promise.all([
    getCorporateGgPoolForPeriod(companyId, period, ctx, db),
    listCompanyProjectsForAutoWeight(companyId, ctx, opts, db),
  ]);

  const warnings: string[] = [];
  if (poolResult.excludedNonArsCount > 0) {
    warnings.push(
      `${poolResult.excludedNonArsCount} comprobante(s) corporativo(s) sin equivalencia comprobable en ARS. El pool está incompleto.`,
    );
  }

  const pool = new Prisma.Decimal(poolResult.poolArs);
  const cdsByProjectId = new Map<string, Prisma.Decimal | null>();
  const range = periodToDateRange(period);
  const cdEntries = await Promise.all(
    projects.map(async (project) => ({ project, accrued: await loadCompanyAccruedForOverhead(project.id, companyId, range, ctx, db) })),
  );
  let totalCd: Prisma.Decimal | null = ZERO;
  let incompleteProjects = 0;
  let incompleteAmounts = 0;
  for (const { project, accrued } of cdEntries) {
    cdsByProjectId.set(project.id, accrued.totalArs);
    if (accrued.totalArs === null) {
      totalCd = null;
      incompleteProjects += 1;
      incompleteAmounts += accrued.missingArsCount;
    } else if (totalCd !== null) {
      totalCd = totalCd.plus(accrued.totalArs);
    }
  }
  if (incompleteProjects > 0) {
    warnings.push(`Costo directo incompleto en ${incompleteProjects} obra(s): ${incompleteAmounts} contribución(es) sin equivalencia comprobable en ARS.`);
  }

  const withoutWeight = totalCd !== null && totalCd.lessThanOrEqualTo(0) && !pool.isZero();
  if (withoutWeight) {
    warnings.push(
      "Hay un saldo de gastos generales en el período y falta un costo directo total positivo para repartirlo.",
    );
  }
  const calculationBlocked = totalCd === null || poolResult.excludedNonArsCount > 0 || withoutWeight;

  return {
    period,
    pool,
    poolArs: poolResult.poolArs,
    invoiceCount: poolResult.invoiceCount,
    excludedNonArsCount: poolResult.excludedNonArsCount,
    totalCd,
    calculationBlocked,
    cdsByProjectId,
    projects,
    warnings,
  };
}

function allocateProjectFromContext(
  context: AutoWeightPeriodContext,
  projectId: string,
): { allocatedAmount: string | null; weightPct: string | null } {
  if (context.calculationBlocked || context.totalCd === null) return { allocatedAmount: null, weightPct: null };
  const cd = context.cdsByProjectId.get(projectId) ?? ZERO;
  const weight = context.totalCd.isZero() ? ZERO : cd.div(context.totalCd);
  return {
    allocatedAmount: serializeMoneyDecimal(context.pool.times(weight)),
    weightPct: computeWeightShare(cd.toFixed(2), context.totalCd.toFixed(2)),
  };
}

export async function getAutoWeightOverheadPreviewForPeriod(
  companyId: string,
  period: string,
  ctx: ServiceContext,
  opts?: BuildAutoWeightContextOpts,
): Promise<AutoWeightPeriodPreview> {
  assertOverheadView(ctx);
  assertOverheadCompanyScope(companyId, ctx);
  await assertApTenantModule(ctx);
  assertValidOverheadPeriod(period);
  const [context, scope] = await Promise.all([
    buildAutoWeightPeriodContext(companyId, period, ctx, opts),
    resolveAccessibleProjectScope(ctx),
  ]);
  const preview = toPeriodPreview(context);
  if (scope === "ALL") return preview;
  const accessible = new Set(scope.projectIds);
  return { ...preview, rows: preview.rows.filter((row) => accessible.has(row.projectId)) };
}

/** D-043 close uses the full company denominator and persists all project snapshots in its transaction. */
export async function getAutoWeightAmountsForClose(
  companyId: string,
  period: string,
  ctx: ServiceContext,
  db: Prisma.TransactionClient,
): Promise<AutoWeightPeriodPreview> {
  assertOverheadEdit(ctx);
  const context = await buildAutoWeightPeriodContext(companyId, period, ctx, AUTO_WEIGHT_PERIOD_CLOSE_OPTS, db);
  return toPeriodPreview(context);
}

function toPeriodPreview(context: AutoWeightPeriodContext): AutoWeightPeriodPreview {
  const rows: AutoWeightProjectRow[] = context.projects.map((p) => {
    const cd = context.cdsByProjectId.get(p.id);
    const { allocatedAmount, weightPct } = allocateProjectFromContext(context, p.id);
    return {
      projectId: p.id,
      projectCode: p.code,
      projectName: p.name,
      accruedCd: cd == null ? null : serializeMoneyDecimal(cd),
      weightPct,
      allocatedAmount,
    };
  });

  return {
    period: context.period,
    poolArs: context.poolArs,
    invoiceCount: context.invoiceCount,
    excludedNonArsCount: context.excludedNonArsCount,
    totalAccruedCd: context.totalCd === null ? null : serializeMoneyDecimal(context.totalCd),
    calculationBlocked: context.calculationBlocked,
    projectCount: context.projects.length,
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
  const [corporate, frozen] = await Promise.all([
    listCorporateGgPeriods(companyId, ctx),
    prisma.overheadPeriodClose.findMany({ where: { tenantId: ctx.tenantId, companyId, status: "FROZEN" }, select: { period: true } }),
  ]);
  const periods = [...new Set([...corporate, ...frozen.map((row) => row.period)])].sort();
  if (periods.length > MAX_CORPORATE_GG_PERIODS) throw new ServiceError("VALIDATION", "Demasiados períodos. Acotá el rango del reporte.");
  return periods.length > 0 ? periods : [currentOverheadPeriod()];
}

export async function sumAutoWeightOverheadForProject(
  projectId: string,
  companyId: string,
  periodFilter: OverheadPeriodFilter | undefined,
  ctx: ServiceContext,
): Promise<{
  amount: Prisma.Decimal | null;
  weightPctDisplay: string | null;
  poolArsTotal: string;
  periods: string[];
  warnings: string[];
}> {
  assertOverheadView(ctx);
  assertOverheadCompanyScope(companyId, ctx);
  const project = await requireProjectAccess(projectId, ctx);
  if (project.companyId !== companyId) throw new ServiceError("FORBIDDEN", "La empresa no coincide con la obra.");
  const periods = await resolveAutoWeightPeriodKeys(companyId, periodFilter, ctx);
  let total = ZERO;
  let incomplete = false;
  let poolSum = ZERO;
  const warnings: string[] = [];
  let lastWeight: string | null = null;

  for (const period of periods) {
    const frozen = await prisma.overheadPeriodClose.findUnique({
      where: {
        tenantId_companyId_period: {
          tenantId: ctx.tenantId,
          companyId,
          period,
        },
      },
      select: { id: true, status: true, poolArs: true },
    });

    if (frozen?.status === "FROZEN") {
      const snap = await prisma.overheadAutoPeriodSnapshot.findUnique({
        where: {
          tenantId_companyId_period_projectId: {
            tenantId: ctx.tenantId,
            companyId,
            period,
            projectId,
          },
        },
        select: { periodCloseId: true, allocatedAmount: true, weightPct: true },
      });
      if (snap) {
        if (snap.periodCloseId !== frozen.id) throw new ServiceError("CONFLICT", "La imputación congelada no coincide con el cierre del período.");
        total = total.plus(snap.allocatedAmount);
        poolSum = poolSum.plus(frozen.poolArs);
        if (periods.length === 1) lastWeight = snap.weightPct.toFixed(2);
      }
      continue;
    }

    // D-043: live OPEN preview must match close rules (exclude DRAFT from CD weights).
    const context = await buildAutoWeightPeriodContext(
      companyId,
      period,
      ctx,
      AUTO_WEIGHT_PERIOD_CLOSE_OPTS,
    );
    const { allocatedAmount, weightPct } = allocateProjectFromContext(context, projectId);
    if (allocatedAmount === null) incomplete = true;
    else total = total.plus(new Prisma.Decimal(allocatedAmount));
    poolSum = poolSum.plus(context.pool);
    if (periods.length === 1) lastWeight = weightPct;
    warnings.push(...context.warnings);
  }

  return {
    amount: incomplete ? null : total,
    weightPctDisplay: lastWeight,
    poolArsTotal: poolSum.toFixed(2),
    periods,
    warnings: [...new Set(warnings)],
  };
}
