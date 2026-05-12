import { prisma } from "@bloqer/database";
import type { CostItem } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type { UpdateCostItemInput } from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { ServiceContext, ServiceError } from "../types";
import { assertBudgetEditable } from "./budget.service";
import { _recalcCostItemTotals, _recalcBudgetSummary } from "./budget-calc.service";

export async function updateCostItem(
  id: string,
  input: UpdateCostItemInput,
  ctx: ServiceContext,
): Promise<CostItem> {
  if (!can(ctx.roles, "EDIT", "BUDGETS")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions");
  }
  const costItem = await prisma.costItem.findUnique({ where: { id } });
  if (!costItem) throw new ServiceError("NOT_FOUND", "Ítem de costo no encontrado");

  const budget = await prisma.budget.findUniqueOrThrow({ where: { id: costItem.budgetId } });
  if (budget.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  assertBudgetEditable(budget);

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.costItem.update({
      where: { id },
      data: {
        unit: input.unit ?? undefined,
        quantity: input.quantity ?? undefined,
        notes: input.notes ?? undefined,
      },
    });
    const settings = await tx.budgetSettings.findUniqueOrThrow({ where: { budgetId: costItem.budgetId } });
    await _recalcCostItemTotals(tx, id, settings);
    await _recalcBudgetSummary(tx, costItem.budgetId);
    return tx.costItem.findUniqueOrThrow({ where: { id } });
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "cost_item.updated",
    entityType: "CostItem",
    entityId: id,
    before: { unit: costItem.unit, quantity: costItem.quantity.toString() },
    after: input,
    ipAddress: ctx.ipAddress,
  });

  return updated;
}
