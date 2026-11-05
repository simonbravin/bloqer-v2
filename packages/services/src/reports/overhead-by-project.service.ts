import { Prisma, prisma } from "@bloqer/database";
import { canViewCompanyAp } from "../ap/ap-access";
import { companyScopeFilter } from "../company-scope";
import { serializeMoneyDecimal } from "../finance/money-decimal";
import { normalizeOverheadPeriodBound } from "../finance/overhead-period";
import { projectRowIdWhereForScope, resolveAccessibleProjectScope } from "../security/access";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import { ServiceContext, ServiceError } from "../types";

export type OverheadByProjectFilters = {
  periodFrom?: string;
  periodTo?: string;
};

export type OverheadByProjectRow = {
  projectId: string;
  projectCode: string;
  projectName: string;
  period: string;
  currency: string;
  amount: string;
  notes: string | null;
};

export type OverheadByProjectReport = {
  rows: OverheadByProjectRow[];
  warnings: string[];
};

export async function getOverheadByProjectReport(
  ctx: ServiceContext,
  filters?: OverheadByProjectFilters,
): Promise<OverheadByProjectReport> {
  if (!canViewCompanyAp(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver gastos generales por proyecto");
  }

  const gate = await getTenantModuleGate(ctx);
  if (!gate.isEnabled("PROJECTS") || !gate.isEnabled("AP")) {
    throw new ServiceError("FORBIDDEN", "Los módulos de proyectos y cuentas por pagar deben estar habilitados.");
  }

  const scope = await resolveAccessibleProjectScope(ctx);
  const where: Prisma.ProjectOverheadAllocationWhereInput = {
    tenantId: ctx.tenantId,
    ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
    company: { tenantId: ctx.tenantId },
    project: { tenantId: ctx.tenantId, ...companyScopeFilter(ctx), ...projectRowIdWhereForScope(scope) },
  };

  const periodFrom = normalizeOverheadPeriodBound(filters?.periodFrom);
  const periodTo = normalizeOverheadPeriodBound(filters?.periodTo);
  if (periodFrom && periodTo && periodFrom > periodTo) {
    throw new ServiceError("VALIDATION", "El período desde debe ser anterior o igual al período hasta.");
  }
  if (periodFrom || periodTo) {
    where.period = {};
    if (periodFrom) where.period.gte = periodFrom;
    if (periodTo) where.period.lte = periodTo;
  }

  const allocations = await prisma.projectOverheadAllocation.findMany({
    where,
    select: {
      projectId: true,
      companyId: true,
      project: { select: { code: true, name: true, companyId: true } },
      period: true,
      currency: true,
      amount: true,
      notes: true,
    },
    orderBy: [{ period: "desc" }, { project: { code: "asc" } }],
  });

  if (allocations.some((row) => row.project.companyId !== null && row.project.companyId !== row.companyId)) {
    throw new ServiceError("CONFLICT", "Hay imputaciones de gastos generales con vínculos de empresa y obra inconsistentes.");
  }

  const rows: OverheadByProjectRow[] = allocations.map((a) => ({
    projectId: a.projectId,
    projectCode: a.project.code ?? "",
    projectName: a.project.name,
    period: a.period,
    currency: a.currency,
    amount: serializeMoneyDecimal(a.amount),
    notes: a.notes,
  }));

  const warnings: string[] = [];
  if (rows.length === 0) {
    warnings.push("No hay imputaciones de gastos generales en el período seleccionado.");
  }

  return { rows, warnings };
}
