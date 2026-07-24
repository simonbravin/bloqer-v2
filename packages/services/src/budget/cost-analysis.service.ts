import { Prisma, prisma } from "@bloqer/database";
import type { CostAnalysisLine } from "@bloqer/database";
import {
  can,
  normalizeStoredApuLineForItemQuantity,
  recomputeLumpForItemQuantity,
  recomputeResourceForItemQuantity,
  roundApuDecimal,
} from "@bloqer/domain";
import type {
  CreateCostAnalysisLineInput,
  SaveCostItemApuInput,
  UpdateCostAnalysisLineInput,
} from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { ServiceContext, ServiceError } from "../types";
import { assertBudgetEditable } from "./budget.service";
import { _recalcCostItemTotals, _recalcBudgetSummary } from "./budget-calc.service";

type TxClient = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

async function _guardLine(costItemId: string, ctx: ServiceContext) {
  const costItem = await prisma.costItem.findUnique({ where: { id: costItemId } });
  if (!costItem) throw new ServiceError("NOT_FOUND", "Ítem de costo no encontrado");
  const budget = await prisma.budget.findUniqueOrThrow({ where: { id: costItem.budgetId } });
  if (budget.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  assertBudgetEditable(budget);
  return { costItem, budget };
}

function resolveLineTotalCost(
  coefficient: Prisma.Decimal | number,
  unitCost: Prisma.Decimal | number,
  totalCost?: number,
): Prisma.Decimal {
  if (totalCost !== undefined && Number.isFinite(totalCost)) {
    return new Prisma.Decimal(roundApuDecimal(totalCost));
  }
  const product = new Prisma.Decimal(coefficient).times(unitCost);
  return new Prisma.Decimal(roundApuDecimal(Number(product.toString())));
}

/** Recompute APU lines that were entered as Total partida when item qty changes. */
export async function _recomputePartidaLinesForQuantity(
  tx: TxClient,
  costItemId: string,
  oldQuantity: Prisma.Decimal,
  newQuantity: Prisma.Decimal,
): Promise<void> {
  if (oldQuantity.equals(newQuantity) || newQuantity.lte(0)) return;

  const lines = await tx.costAnalysisLine.findMany({ where: { costItemId } });
  const newQtyN = Number(newQuantity.toString());
  const oldQtyN = Number(oldQuantity.toString());
  // Scaling lump from qty ≤ 0 would do totalCost × 0 → wipe partida money.
  const canScaleLump = oldQtyN > 0;

  for (const line of lines) {
    if (line.partidaQuantity == null) continue;

    if (line.isLumpSum) {
      if (!canScaleLump) continue;
      const partidaMoney = Number(line.totalCost.toString()) * oldQtyN;
      const next = recomputeLumpForItemQuantity(partidaMoney, newQtyN);
      await tx.costAnalysisLine.update({
        where: { id: line.id },
        data: {
          coefficient: next.coefficient,
          unitCost: next.unitCost,
          totalCost: next.totalCost,
          partidaQuantity: next.partidaQuantity,
          isLumpSum: true,
        },
      });
      continue;
    }

    const next = recomputeResourceForItemQuantity(
      {
        coefficient: Number(line.coefficient.toString()),
        unitCost: Number(line.unitCost.toString()),
        totalCost: Number(line.totalCost.toString()),
        partidaQuantity: Number(line.partidaQuantity.toString()),
        isLumpSum: false,
      },
      newQtyN,
    );
    await tx.costAnalysisLine.update({
      where: { id: line.id },
      data: {
        coefficient: next.coefficient,
        unitCost: next.unitCost,
        totalCost: next.totalCost,
        partidaQuantity: next.partidaQuantity,
        isLumpSum: false,
      },
    });
  }
}

export async function addCostAnalysisLine(
  input: CreateCostAnalysisLineInput,
  ctx: ServiceContext,
): Promise<CostAnalysisLine> {
  if (!can(ctx.roles, "EDIT", "BUDGETS")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions");
  }
  const { costItem, budget } = await _guardLine(input.costItemId, ctx);

  const wbsNode = await prisma.wbsNode.findUniqueOrThrow({ where: { id: costItem.wbsNodeId } });
  if (wbsNode.type !== "ITEM") {
    throw new ServiceError("CONFLICT", "Solo nodos ITEM pueden tener análisis de costo");
  }

  const line = await prisma.$transaction(async (tx) => {
    const totalCost = resolveLineTotalCost(input.coefficient, input.unitCost, input.totalCost);
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
        partidaQuantity: input.partidaQuantity ?? null,
        isLumpSum: input.isLumpSum ?? false,
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
    const newCoefficient =
      input.coefficient !== undefined ? new Prisma.Decimal(input.coefficient) : existing.coefficient;
    const newUnitCost =
      input.unitCost !== undefined ? new Prisma.Decimal(input.unitCost) : existing.unitCost;
    const totalCost = resolveLineTotalCost(
      newCoefficient,
      newUnitCost,
      input.totalCost,
    );

    const l = await tx.costAnalysisLine.update({
      where: { id },
      data: {
        ...input,
        totalCost,
        partidaQuantity:
          input.partidaQuantity === undefined ? undefined : input.partidaQuantity,
        isLumpSum: input.isLumpSum,
      },
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

/**
 * Atomic save of CostItem fields + APU lines ([D-047] C4).
 * Lines with `id` are updated; without id are created; `_delete` removes existing.
 */
export async function saveCostItemApu(
  input: SaveCostItemApuInput,
  ctx: ServiceContext,
): Promise<{ ok: true }> {
  if (!can(ctx.roles, "EDIT", "BUDGETS")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions");
  }
  const { costItem, budget } = await _guardLine(input.costItemId, ctx);

  const wbsNode = await prisma.wbsNode.findUniqueOrThrow({ where: { id: costItem.wbsNodeId } });
  if (wbsNode.type !== "ITEM") {
    throw new ServiceError("CONFLICT", "Solo nodos ITEM pueden tener análisis de costo");
  }

  if (input.quantity !== undefined && !(input.quantity > 0)) {
    throw new ServiceError("VALIDATION", "La cantidad del ítem debe ser mayor a 0");
  }

  await prisma.$transaction(async (tx) => {
    const newQty =
      input.quantity !== undefined ? new Prisma.Decimal(input.quantity) : costItem.quantity;
    const itemQtyN = Number(newQty.toString());
    if (!(itemQtyN > 0)) {
      throw new ServiceError(
        "VALIDATION",
        "Definí una cantidad de ítem mayor a 0 antes de guardar el APU",
      );
    }

    await tx.costItem.update({
      where: { id: input.costItemId },
      data: {
        unit: input.unit ?? undefined,
        quantity: input.quantity !== undefined ? input.quantity : undefined,
        notes: input.notes === undefined ? undefined : input.notes,
      },
    });

    // Payload lines normalized against the quantity being saved ([D-047]).
    // Resource: derive coef/totalCost from partidaQuantity (idempotent).
    // Lump: totalCost is unit contribution for itemQtyN (dialog recomputes on qty change).
    const existingIds = new Set(
      (await tx.costAnalysisLine.findMany({
        where: { costItemId: input.costItemId },
        select: { id: true },
      })).map((l) => l.id),
    );

    for (const line of input.lines) {
      if (line._delete && line.id) {
        if (existingIds.has(line.id)) {
          await tx.costAnalysisLine.delete({ where: { id: line.id } });
          existingIds.delete(line.id);
        }
        continue;
      }

      const partidaQuantity = line.partidaQuantity === undefined ? null : line.partidaQuantity;
      const isLumpSum = line.isLumpSum ?? false;
      const resolvedTotal = resolveLineTotalCost(line.coefficient, line.unitCost, line.totalCost);
      const normalized = normalizeStoredApuLineForItemQuantity(
        {
          coefficient: line.coefficient,
          unitCost: line.unitCost,
          totalCost: Number(resolvedTotal.toString()),
          partidaQuantity,
          isLumpSum,
        },
        itemQtyN,
      );

      if (line.id && existingIds.has(line.id)) {
        await tx.costAnalysisLine.update({
          where: { id: line.id },
          data: {
            category: line.category,
            description: line.description,
            unit: line.unit,
            coefficient: normalized.coefficient,
            unitCost: normalized.unitCost,
            totalCost: normalized.totalCost,
            partidaQuantity: normalized.partidaQuantity,
            isLumpSum: normalized.isLumpSum,
            sortOrder: line.sortOrder ?? 0,
            notes: line.notes ?? null,
          },
        });
        existingIds.delete(line.id);
      } else if (!line.id) {
        await tx.costAnalysisLine.create({
          data: {
            costItemId: input.costItemId,
            budgetId: costItem.budgetId,
            category: line.category,
            description: line.description,
            unit: line.unit,
            coefficient: normalized.coefficient,
            unitCost: normalized.unitCost,
            totalCost: normalized.totalCost,
            partidaQuantity: normalized.partidaQuantity,
            isLumpSum: normalized.isLumpSum,
            sortOrder: line.sortOrder ?? 0,
            notes: line.notes ?? null,
          },
        });
      } else {
        // Stale/foreign id: must not silently drop the edit or orphan-delete wrongly.
        throw new ServiceError(
          "CONFLICT",
          "Una línea APU ya no existe o no pertenece a este ítem. Recargá y volvé a intentar.",
        );
      }
    }

    // Payload is the full APU set — remove lines omitted from the client list.
    if (existingIds.size > 0) {
      await tx.costAnalysisLine.deleteMany({
        where: { id: { in: [...existingIds] } },
      });
    }

    const settings = await tx.budgetSettings.findUniqueOrThrow({ where: { budgetId: costItem.budgetId } });
    await _recalcCostItemTotals(tx, input.costItemId, settings);
    await _recalcBudgetSummary(tx, costItem.budgetId);
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "cost_item.apu_saved",
    entityType: "CostItem",
    entityId: input.costItemId,
    after: { budgetId: budget.id, lineCount: input.lines.length },
    ipAddress: ctx.ipAddress,
  });

  return { ok: true };
}
