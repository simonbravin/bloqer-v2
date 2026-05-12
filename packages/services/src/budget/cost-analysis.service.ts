import { Prisma, prisma } from "@bloqer/database";
import type { CostAnalysisLine } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type { CreateCostAnalysisLineInput, UpdateCostAnalysisLineInput } from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { ServiceContext, ServiceError } from "../types";
import { assertBudgetEditable } from "./budget.service";
import { _recalcCostItemTotals, _recalcBudgetSummary } from "./budget-calc.service";

async function _guardLine(costItemId: string, ctx: ServiceContext) {
  const costItem = await prisma.costItem.findUnique({ where: { id: costItemId } });
  if (!costItem) throw new ServiceError("NOT_FOUND", "Ítem de costo no encontrado");
  const budget = await prisma.budget.findUniqueOrThrow({ where: { id: costItem.budgetId } });
  if (budget.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  assertBudgetEditable(budget);
  return { costItem, budget };
}

export async function addCostAnalysisLine(
  input: CreateCostAnalysisLineInput,
  ctx: ServiceContext,
): Promise<CostAnalysisLine> {
  if (!can(ctx.roles, "EDIT", "BUDGETS")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions");
  }
  const { costItem, budget } = await _guardLine(input.costItemId, ctx);

  // Verify the CostItem's WbsNode is of type ITEM
  const wbsNode = await prisma.wbsNode.findUniqueOrThrow({ where: { id: costItem.wbsNodeId } });
  if (wbsNode.type !== "ITEM") {
    throw new ServiceError("CONFLICT", "Solo nodos ITEM pueden tener análisis de costo");
  }

  const line = await prisma.$transaction(async (tx) => {
    const totalCost = new Prisma.Decimal(input.coefficient).times(input.unitCost);
    const l = await tx.costAnalysisLine.create({
      data: {
        costItemId: input.costItemId,
        budgetId: costItem.budgetId,
        category: input.category,
        description: input.description,
        unit: input.unit,
        coefficient: input.coefficient,
        unitCost: input.unitCost,
        totalCost,
        sortOrder: input.sortOrder ?? 0,
        supplierContactId: input.supplierContactId ?? null,
        notes: input.notes ?? null,
      },
    });
    const settings = await tx.budgetSettings.findUniqueOrThrow({ where: { budgetId: costItem.budgetId } });
    await _recalcCostItemTotals(tx, input.costItemId, settings);
    await _recalcBudgetSummary(tx, costItem.budgetId);
    return l;
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "cost_analysis_line.added",
    entityType: "CostAnalysisLine",
    entityId: line.id,
    after: { category: input.category, description: input.description, budgetId: budget.id },
    ipAddress: ctx.ipAddress,
  });

  return line;
}

export async function updateCostAnalysisLine(
  id: string,
  input: UpdateCostAnalysisLineInput,
  ctx: ServiceContext,
): Promise<CostAnalysisLine> {
  if (!can(ctx.roles, "EDIT", "BUDGETS")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions");
  }
  const existing = await prisma.costAnalysisLine.findUnique({ where: { id } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Línea de análisis no encontrada");
  await _guardLine(existing.costItemId, ctx);

  const updated = await prisma.$transaction(async (tx) => {
    const newCoefficient = input.coefficient !== undefined
      ? new Prisma.Decimal(input.coefficient)
      : existing.coefficient;
    const newUnitCost = input.unitCost !== undefined
      ? new Prisma.Decimal(input.unitCost)
      : existing.unitCost;
    const totalCost = newCoefficient.times(newUnitCost);

    const l = await tx.costAnalysisLine.update({
      where: { id },
      data: { ...input, totalCost },
    });
    const settings = await tx.budgetSettings.findUniqueOrThrow({ where: { budgetId: existing.budgetId } });
    await _recalcCostItemTotals(tx, existing.costItemId, settings);
    await _recalcBudgetSummary(tx, existing.budgetId);
    return l;
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "cost_analysis_line.updated",
    entityType: "CostAnalysisLine",
    entityId: id,
    after: input,
    ipAddress: ctx.ipAddress,
  });

  return updated;
}

export async function removeCostAnalysisLine(id: string, ctx: ServiceContext): Promise<void> {
  if (!can(ctx.roles, "EDIT", "BUDGETS")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions");
  }
  const existing = await prisma.costAnalysisLine.findUnique({ where: { id } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Línea de análisis no encontrada");
  await _guardLine(existing.costItemId, ctx);

  await prisma.$transaction(async (tx) => {
    await tx.costAnalysisLine.delete({ where: { id } });
    const settings = await tx.budgetSettings.findUniqueOrThrow({ where: { budgetId: existing.budgetId } });
    await _recalcCostItemTotals(tx, existing.costItemId, settings);
    await _recalcBudgetSummary(tx, existing.budgetId);
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "cost_analysis_line.removed",
    entityType: "CostAnalysisLine",
    entityId: id,
    after: { budgetId: existing.budgetId },
    ipAddress: ctx.ipAddress,
  });
}
