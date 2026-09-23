import { prisma } from "@bloqer/database";
import { pickPrincipalContractualBudget } from "../budget/pick-principal-budget";
import { ServiceContext } from "../types";

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
  const budgets = await prisma.budget.findMany({
    where: { projectId, tenantId: ctx.tenantId, status: { in: ["APPROVED", "CLOSED"] } },
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
  return prisma.budget.findMany({
    where: { projectId, tenantId: ctx.tenantId, status: { in: ["APPROVED", "CLOSED"] } },
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
