import { prisma } from "@bloqer/database";
import { ServiceContext } from "../types";

export type ResolvedApprovedBudget = {
  id: string;
  name: string;
  status: string;
};

export async function resolveApprovedBudgetForProject(
  projectId: string,
  budgetId: string | undefined,
  ctx: ServiceContext,
): Promise<ResolvedApprovedBudget | null> {
  const budgets = await prisma.budget.findMany({
    where: { projectId, tenantId: ctx.tenantId, status: { in: ["APPROVED", "CLOSED"] } },
    select: { id: true, name: true, status: true },
    orderBy: { updatedAt: "desc" },
  });
  if (budgets.length === 0) return null;
  if (budgetId) return budgets.find((b) => b.id === budgetId) ?? null;
  return budgets[0]!;
}

export async function listApprovedBudgetsForProject(
  projectId: string,
  ctx: ServiceContext,
): Promise<ResolvedApprovedBudget[]> {
  return prisma.budget.findMany({
    where: { projectId, tenantId: ctx.tenantId, status: { in: ["APPROVED", "CLOSED"] } },
    select: { id: true, name: true, status: true },
    orderBy: { updatedAt: "desc" },
  });
}
