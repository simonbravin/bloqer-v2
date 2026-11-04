import { prisma } from "@bloqer/database";
import { pickPrincipalContractualBudget } from "../budget/pick-principal-budget";
import { companyScopeFilter } from "../company-scope";
import { canViewBudgetsArea } from "../project/project-nav-guards";
import { requireProjectAccess } from "../security/access";
import { assertTenantModuleEnabledWithGate, getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import { ServiceContext, ServiceError } from "../types";

async function assertBudgetReportAccess(projectId: string, ctx: ServiceContext): Promise<void> {
  if (!canViewBudgetsArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver presupuestos.");
  }
  await requireProjectAccess(projectId, ctx);
  const gate = await getTenantModuleGate(ctx);
  assertTenantModuleEnabledWithGate(gate, "PROJECTS");
  assertTenantModuleEnabledWithGate(gate, "BUDGETS");
}

export type ResolvedApprovedBudget = {
  id: string;
  name: string;
  status: string;
  currency: string;
  versionNumber: number;
  parentBudgetId: string | null;
};

export async function resolveApprovedBudgetForProject(
  projectId: string,
  budgetId: string | undefined,
  ctx: ServiceContext,
): Promise<ResolvedApprovedBudget | null> {
  await assertBudgetReportAccess(projectId, ctx);
  const budgets = await prisma.budget.findMany({
    where: { projectId, tenantId: ctx.tenantId, ...companyScopeFilter(ctx), status: { in: ["APPROVED", "CLOSED"] } },
    select: {
      id: true,
      name: true,
      status: true,
      currency: true,
      parentBudgetId: true,
      versionNumber: true,
    },
    orderBy: { versionNumber: "asc" },
  });
  if (budgets.length === 0) return null;
  const picked = budgetId
    ? budgets.find((b) => b.id === budgetId)
    : pickPrincipalContractualBudget(budgets);
  if (!picked) return null;
  return {
    id: picked.id,
    name: picked.name,
    status: picked.status,
    currency: picked.currency,
    versionNumber: picked.versionNumber,
    parentBudgetId: picked.parentBudgetId,
  };
}

export async function listApprovedBudgetsForProject(
  projectId: string,
  ctx: ServiceContext,
): Promise<ResolvedApprovedBudget[]> {
  await assertBudgetReportAccess(projectId, ctx);
  return prisma.budget.findMany({
    where: { projectId, tenantId: ctx.tenantId, ...companyScopeFilter(ctx), status: { in: ["APPROVED", "CLOSED"] } },
    select: {
      id: true,
      name: true,
      status: true,
      currency: true,
      versionNumber: true,
      parentBudgetId: true,
    },
    orderBy: { updatedAt: "desc" },
  });
}
