import { prisma } from "@bloqer/database";
import type { BudgetSettings } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type { UpdateBudgetSettingsInput } from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { ServiceContext, ServiceError } from "../types";
import { assertBudgetEditable } from "./budget.service";
import { _recalcAllItems } from "./budget-calc.service";

export async function updateBudgetSettings(
  budgetId: string,
  input: UpdateBudgetSettingsInput,
  ctx: ServiceContext,
): Promise<BudgetSettings> {
  if (!can(ctx.roles, "EDIT", "BUDGETS")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions");
  }
  const budget = await prisma.budget.findUnique({ where: { id: budgetId } });
  if (!budget) throw new ServiceError("NOT_FOUND", "Presupuesto no encontrado");
  if (budget.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  assertBudgetEditable(budget);

  const settings = await prisma.$transaction(async (tx) => {
    const updated = await tx.budgetSettings.update({
      where: { budgetId },
      data: input,
    });
    await _recalcAllItems(tx, budgetId);
    return updated;
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "budget_settings.updated",
    entityType: "BudgetSettings",
    entityId: settings.id,
    after: input,
    ipAddress: ctx.ipAddress,
  });

  return settings;
}
