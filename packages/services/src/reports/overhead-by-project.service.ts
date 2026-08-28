import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
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
  if (!can(ctx.roles, "VIEW", "AP") && !can(ctx.roles, "VIEW", "PROJECTS")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver gastos generales por proyecto");
  }

  const gate = await getTenantModuleGate(ctx);
  if (!gate.isEnabled("PROJECTS")) {
    throw new ServiceError("FORBIDDEN", "Módulo de proyectos deshabilitado");
  }

  const where: Prisma.ProjectOverheadAllocationWhereInput = {
    tenantId: ctx.tenantId,
  };

  if (filters?.periodFrom || filters?.periodTo) {
    where.period = {};
    if (filters.periodFrom) where.period.gte = filters.periodFrom;
    if (filters.periodTo) where.period.lte = filters.periodTo;
  }

  const allocations = await prisma.projectOverheadAllocation.findMany({
    where,
    select: {
      projectId: true,
      project: { select: { code: true, name: true } },
      period: true,
      currency: true,
      amount: true,
      notes: true,
    },
    orderBy: [{ period: "desc" }, { project: { code: "asc" } }],
  });

  const rows: OverheadByProjectRow[] = allocations.map((a) => ({
    projectId: a.projectId,
    projectCode: a.project.code ?? "",
    projectName: a.project.name,
    period: a.period,
    currency: a.currency,
    amount: a.amount.toFixed(2),
    notes: a.notes,
  }));

  const warnings: string[] = [];
  if (rows.length === 0) {
    warnings.push("No hay imputaciones de gastos generales en el período seleccionado.");
  }

  return { rows, warnings };
}
