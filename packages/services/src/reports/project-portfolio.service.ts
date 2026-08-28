import { Prisma, prisma } from "@bloqer/database";
import type { ProjectStatus } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { getProjectCostControl } from "../cost-control/cost-control.service";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import { ServiceContext, ServiceError } from "../types";

export type PortfolioFilters = {
  status?: ProjectStatus;
};

export type ProjectPortfolioRow = {
  projectId: string;
  code: string;
  name: string;
  status: string;
  budgetTotalCost: string;
  committedCost: string;
  accruedCost: string;
  expectedCostExposure: string;
  costVariance: string;
  certifiedApproved: string;
  pctExposure: string | null;
  warning: string | null;
};

export type ProjectPortfolioReport = {
  rows: ProjectPortfolioRow[];
  warnings: string[];
};

export async function getProjectPortfolioReport(
  ctx: ServiceContext,
  filters?: PortfolioFilters,
): Promise<ProjectPortfolioReport> {
  if (!can(ctx.roles, "VIEW", "PROJECTS")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver portafolio de proyectos");
  }

  const gate = await getTenantModuleGate(ctx);
  if (!gate.isEnabled("PROJECTS")) {
    throw new ServiceError("FORBIDDEN", "Módulo de proyectos deshabilitado");
  }

  const statusFilter: Prisma.ProjectWhereInput = filters?.status
    ? { status: filters.status }
    : { status: { not: "CANCELLED" } };

  const projects = await prisma.project.findMany({
    where: {
      tenantId: ctx.tenantId,
      ...statusFilter,
    },
    select: { id: true, code: true, name: true, status: true },
    orderBy: { code: "asc" },
  });

  const rows: ProjectPortfolioRow[] = [];
  const warnings: string[] = [];
  const ZERO = "0.00";

  function rowFromTotals(
    project: { id: string; code: string | null; name: string; status: string },
    t: {
      budgetTotalCost: string;
      committedCost: string;
      accruedCost: string;
      expectedCostExposure: string;
      costVariance: string;
      certifiedApproved: string;
    },
    warning: string | null,
  ): ProjectPortfolioRow {
    const budgetDec = new Prisma.Decimal(t.budgetTotalCost);
    return {
      projectId: project.id,
      code: project.code ?? "",
      name: project.name,
      status: project.status,
      budgetTotalCost: t.budgetTotalCost,
      committedCost: t.committedCost,
      accruedCost: t.accruedCost,
      expectedCostExposure: t.expectedCostExposure,
      costVariance: t.costVariance,
      certifiedApproved: t.certifiedApproved,
      pctExposure: budgetDec.isZero()
        ? null
        : new Prisma.Decimal(t.expectedCostExposure).div(budgetDec).times(100).toFixed(2),
      warning,
    };
  }

  const settled = await Promise.allSettled(
    projects.map(async (project) => {
      const cc = await getProjectCostControl(project.id, {}, ctx);
      if (cc.type === "NO_APPROVED_BUDGETS") {
        return rowFromTotals(
          project,
          {
            budgetTotalCost: ZERO,
            committedCost: ZERO,
            accruedCost: ZERO,
            expectedCostExposure: ZERO,
            costVariance: ZERO,
            certifiedApproved: ZERO,
          },
          "Sin presupuesto aprobado",
        );
      }
      if (cc.type === "BUDGET_SELECTION_REQUIRED") {
        const firstBudget = cc.availableBudgets[0];
        const ccRetry = await getProjectCostControl(
          project.id,
          { budgetId: firstBudget?.id },
          ctx,
        );
        if (ccRetry.type !== "REPORT") {
          return rowFromTotals(
            project,
            {
              budgetTotalCost: ZERO,
              committedCost: ZERO,
              accruedCost: ZERO,
              expectedCostExposure: ZERO,
              costVariance: ZERO,
              certifiedApproved: ZERO,
            },
            "Requiere selección de presupuesto",
          );
        }
        return rowFromTotals(project, ccRetry.totals, null);
      }
      return rowFromTotals(project, cc.totals, null);
    }),
  );

  for (let i = 0; i < settled.length; i++) {
    const project = projects[i]!;
    const outcome = settled[i]!;
    if (outcome.status === "fulfilled") {
      rows.push(outcome.value);
    } else {
      warnings.push(`No se pudo obtener datos para ${project.code ?? project.name}`);
      rows.push(
        rowFromTotals(
          project,
          {
            budgetTotalCost: ZERO,
            committedCost: ZERO,
            accruedCost: ZERO,
            expectedCostExposure: ZERO,
            costVariance: ZERO,
            certifiedApproved: ZERO,
          },
          "Error al obtener datos",
        ),
      );
    }
  }

  return { rows, warnings };
}
