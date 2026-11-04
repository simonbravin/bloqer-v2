import { Prisma, prisma } from "@bloqer/database";
import type { CostItem } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type { UpdateCostItemInput } from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { ServiceContext, ServiceError } from "../types";
import { assertProjectAllowsBudgetPlanning } from "../project/project-operational-guard";
import { assertTenantModuleEnabled } from "../tenant-modules/tenant-module.service";
import { approvedEditOverrideAuditMeta, lockBudgetForEconomicEdit } from "./budget.service";
import { assertCostItemQuantityNotBelowCertified } from "./cost-item-certified-qty";
import { _recalcCostItemTotals, _recalcBudgetSummary } from "./budget-calc.service";
import { _recomputePartidaLinesForQuantity } from "./cost-analysis.service";
import { serializeQtyDecimal } from "../finance/money-decimal";
import { assertBudgetDecimalFits } from "./budget-decimal";

export async function updateCostItem(
  id: string,
  input: UpdateCostItemInput,
  ctx: ServiceContext,
): Promise<CostItem> {
  if (!can(ctx.roles, "EDIT", "BUDGETS")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions");
  }
  await assertTenantModuleEnabled(ctx, "BUDGETS");
  const costItem = await prisma.costItem.findUnique({ where: { id } });
  if (!costItem) throw new ServiceError("NOT_FOUND", "Ítem de costo no encontrado");

  const budget = await prisma.budget.findUniqueOrThrow({ where: { id: costItem.budgetId } });
  if (budget.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  await assertProjectAllowsBudgetPlanning(budget.projectId, ctx);

  if (input.quantity !== undefined && (!Number.isFinite(input.quantity) || !(input.quantity > 0))) {
    throw new ServiceError("VALIDATION", "La cantidad del ítem debe ser mayor a 0");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const currentBudget = await lockBudgetForEconomicEdit(tx, costItem.budgetId, ctx);
    const current = await tx.costItem.findUnique({ where: { id } });
    if (!current || current.budgetId !== budget.id) throw new ServiceError("NOT_FOUND", "Ítem de costo no encontrado");
    const node = await tx.wbsNode.findFirst({ where: { id: current.wbsNodeId, budgetId: budget.id, type: "ITEM" } });
    if (!node || await tx.wbsNode.count({ where: { parentId: current.wbsNodeId } })) {
      throw new ServiceError("CONFLICT", "El cómputo se carga en un ítem hoja de este presupuesto");
    }
    const oldQty = current.quantity;
    const newQty =
      input.quantity !== undefined ? new Prisma.Decimal(input.quantity).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP) : oldQty;
    if (input.quantity !== undefined && !newQty.gt(0)) throw new ServiceError("VALIDATION", "La cantidad mínima del ítem es 0,0001");
    assertBudgetDecimalFits(newQty, "Cantidad del ítem");

    if (input.quantity !== undefined) {
      await assertCostItemQuantityNotBelowCertified(tx, {
        wbsNodeId: current.wbsNodeId,
        tenantId: ctx.tenantId,
        quantity: newQty,
      });
    }
    if (newQty.gt(0) && !(input.unit ?? current.unit).trim()) {
      throw new ServiceError("VALIDATION", "La unidad del ítem es obligatoria");
    }

    await tx.costItem.update({
      where: { id },
      data: {
        unit: input.unit?.trim(),
        quantity: input.quantity !== undefined ? newQty.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP) : undefined,
        notes: input.notes,
      },
    });

    if (input.quantity !== undefined && !oldQty.equals(newQty)) {
      await _recomputePartidaLinesForQuantity(tx, id, oldQty, newQty);
    }

    const settings = await tx.budgetSettings.findUniqueOrThrow({ where: { budgetId: costItem.budgetId } });
    await _recalcCostItemTotals(tx, id, settings);
    await _recalcBudgetSummary(tx, costItem.budgetId);
    await log({
      tenantId: ctx.tenantId,
      actorUserId: ctx.actorUserId,
      action: "cost_item.updated",
      entityType: "CostItem",
      entityId: id,
      projectId: budget.projectId,
      before: { unit: current.unit, quantity: serializeQtyDecimal(current.quantity), notes: current.notes },
      after: {
        ...input,
        ...approvedEditOverrideAuditMeta(currentBudget.status),
      },
      ipAddress: ctx.ipAddress,
    }, tx);
    return tx.costItem.findUniqueOrThrow({ where: { id } });
  }, { maxWait: 10_000, timeout: 30_000 });

  return updated;
}
