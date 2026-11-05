import { Prisma, prisma } from "@bloqer/database";
import type { Budget, CostAnalysisLine } from "@bloqer/database";
import { APU_GLOBAL_UNIT, can, isGlobalUnit } from "@bloqer/domain";
import type {
  CreateCostAnalysisLineInput,
  SaveCostItemApuInput,
  UpdateCostAnalysisLineInput,
} from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { ServiceContext, ServiceError } from "../types";
import { assertProjectAllowsBudgetPlanning } from "../project/project-operational-guard";
import { assertTenantModuleEnabled } from "../tenant-modules/tenant-module.service";
import { isCrossCompany } from "../company-scope";
import { assertContactRoleInTenant } from "../contact/assert-contact-role";
import { toMoneyDecimal } from "../finance/money-decimal";
import { approvedEditOverrideAuditMeta, lockBudgetForEconomicEdit } from "./budget.service";
import { assertCostItemQuantityNotBelowCertified } from "./cost-item-certified-qty";
import { _recalcCostItemTotals, _recalcBudgetSummary } from "./budget-calc.service";
import { assertBudgetDecimalFits } from "./budget-decimal";
import { computeApuUnitContribution } from "./budget-apu-calc";
import {
  assertProductUnitCompatible,
  lockProductsForUnitReferences,
  normalizeProductUnit,
} from "../inventory/product-unit";

/** Persist APU decimals at 4 dp half-up — avoid writing raw IEEE floats. */
function apuDecimal(value: Prisma.Decimal | number | string): Prisma.Decimal {
  const decimal = assertBudgetDecimalFits(value, "APU");
  if (decimal.isNegative()) {
    throw new ServiceError(
      "VALIDATION",
      "Las cantidades y costos del APU deben ser números finitos no negativos",
    );
  }
  return decimal.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
}

function apuMoney(value: Prisma.Decimal): Prisma.Decimal {
  return assertBudgetDecimalFits(toMoneyDecimal(value), "Costo del APU");
}

type TxClient = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

async function _guardLine(costItemId: string, ctx: ServiceContext) {
  await assertTenantModuleEnabled(ctx, "BUDGETS");
  const costItem = await prisma.costItem.findUnique({ where: { id: costItemId } });
  if (!costItem) throw new ServiceError("NOT_FOUND", "Ítem de costo no encontrado");
  const budget = await prisma.budget.findUniqueOrThrow({ where: { id: costItem.budgetId } });
  if (budget.tenantId !== ctx.tenantId)
    throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (isCrossCompany(budget.companyId, ctx))
    throw new ServiceError("FORBIDDEN", "Presupuesto de otra empresa");
  await assertProjectAllowsBudgetPlanning(budget.projectId, ctx);
  return { costItem, budget };
}

type ApuDecimalInput = Prisma.Decimal | number | string;

/** D-047: resource quantities and unit prices retain 4 dp; contribution is money (D-053). */
export function normalizeApuLineForPersistence(
  line: {
    coefficient: ApuDecimalInput;
    unitCost: ApuDecimalInput;
    totalCost?: ApuDecimalInput;
    partidaQuantity?: ApuDecimalInput | null;
    isLumpSum?: boolean;
  },
  itemQuantity: ApuDecimalInput,
) {
  const quantity = apuDecimal(itemQuantity);
  let coefficient = apuDecimal(line.coefficient);
  let unitCost = apuDecimal(line.unitCost);
  let partidaQuantity = line.partidaQuantity == null ? null : apuDecimal(line.partidaQuantity);
  if (line.isLumpSum) {
    if (!quantity.gt(0))
      throw new ServiceError(
        "VALIDATION",
        "Definí una cantidad de ítem mayor a 0 antes de cargar un total de partida",
      );
    // Convert legacy money-only lines to the documented Global resource representation.
    const unitContribution =
      line.totalCost === undefined ? coefficient.times(unitCost) : apuDecimal(line.totalCost);
    partidaQuantity = new Prisma.Decimal(1);
    unitCost = apuDecimal(unitContribution.times(quantity));
  }
  if (partidaQuantity !== null) {
    if (!quantity.gt(0))
      throw new ServiceError(
        "VALIDATION",
        "Definí una cantidad de ítem mayor a 0 antes de cargar un total de partida",
      );
    coefficient = apuDecimal(partidaQuantity.div(quantity));
  }
  const totalCost = assertBudgetDecimalFits(
    computeApuUnitContribution(
      {
        coefficient: coefficient.toString(),
        unitCost: unitCost.toString(),
        partidaQuantity: partidaQuantity?.toString() ?? null,
      },
      quantity.toString(),
    ),
    "Costo del APU",
  );
  return { coefficient, unitCost, totalCost, partidaQuantity, isLumpSum: false };
}

async function assertApuItem(tx: TxClient, costItemId: string, budgetId: string) {
  const item = await tx.costItem.findUnique({ where: { id: costItemId } });
  if (!item || item.budgetId !== budgetId)
    throw new ServiceError("NOT_FOUND", "Ítem de costo no encontrado");
  const node = await tx.wbsNode.findFirst({
    where: { id: item.wbsNodeId, budgetId, type: "ITEM" },
  });
  if (!node || (await tx.wbsNode.count({ where: { parentId: item.wbsNodeId } }))) {
    throw new ServiceError("CONFLICT", "Solo las partidas hoja pueden tener análisis de costo");
  }
  return item;
}

async function assertApuReferences(
  tx: TxClient,
  input: { productId?: string | null; supplierContactId?: string | null; unit?: string },
  budget: Pick<Budget, "companyId" | "projectId">,
  ctx: ServiceContext,
) {
  if (input.productId) {
    const project = await tx.project.findUnique({
      where: { id: budget.projectId },
      select: { companyId: true },
    });
    const companyId = budget.companyId ?? project?.companyId ?? ctx.companyId;
    if (companyId)
      await tx.$queryRaw`SELECT id FROM companies WHERE id = ${companyId} AND "tenantId" = ${ctx.tenantId} FOR KEY SHARE`;
    await lockProductsForUnitReferences(tx, [input.productId], ctx.tenantId);
    const product = await tx.product.findUnique({
      where: { id: input.productId },
      select: { tenantId: true, companyId: true, unit: true },
    });
    if (
      !product ||
      product.tenantId !== ctx.tenantId ||
      isCrossCompany(product.companyId, { ...ctx, companyId: companyId ?? ctx.companyId })
    ) {
      throw new ServiceError("NOT_FOUND", "Producto no encontrado en la empresa del presupuesto");
    }
    if (input.unit !== undefined) assertProductUnitCompatible(product.unit, input.unit);
  }
  if (input.supplierContactId)
    await assertContactRoleInTenant(input.supplierContactId, "SUPPLIER", ctx.tenantId, { tx });
}

/** Do not remove purchasing hints already used by an operational document. */
async function assertApuLinesDeletable(tx: TxClient, ids: string[]) {
  if (ids.length === 0) return;
  await tx.$queryRaw`SELECT id FROM cost_analysis_lines WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
  const where = { costAnalysisLineId: { in: ids } };
  const counts = await Promise.all([
    tx.purchaseRequestLine.count({ where }),
    tx.purchaseOrderLine.count({ where }),
    tx.supplierInvoiceLine.count({ where }),
  ]);
  if (counts.some((count) => count > 0))
    throw new ServiceError(
      "CONFLICT",
      "No se puede eliminar un insumo APU vinculado a solicitudes, órdenes de compra o facturas",
    );
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
  for (const line of lines) {
    if (line.partidaQuantity == null && !line.isLumpSum) continue;

    if (line.isLumpSum) {
      if (!oldQuantity.gt(0)) continue;
      const nextTotal = apuMoney(line.totalCost.times(oldQuantity).div(newQuantity));
      await tx.costAnalysisLine.update({
        where: { id: line.id },
        data: {
          coefficient: 1,
          unitCost: nextTotal,
          totalCost: nextTotal,
          partidaQuantity: 1,
          isLumpSum: true,
        },
      });
      continue;
    }

    const next = normalizeApuLineForPersistence(line, newQuantity);
    await tx.costAnalysisLine.update({
      where: { id: line.id },
      data: {
        coefficient: apuDecimal(next.coefficient),
        unitCost: apuDecimal(next.unitCost),
        totalCost: next.totalCost,
        partidaQuantity: next.partidaQuantity == null ? null : apuDecimal(next.partidaQuantity),
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

  const line = await prisma.$transaction(
    async (tx) => {
      const currentBudget = await lockBudgetForEconomicEdit(tx, budget.id, ctx);
      const currentItem = await assertApuItem(tx, costItem.id, budget.id);
      const stored = normalizeApuLineForPersistence(input, currentItem.quantity);
      let unit = input.unit;
      if (input.isLumpSum) {
        unit = isGlobalUnit(unit) ? unit : APU_GLOBAL_UNIT;
      }
      await assertApuReferences(tx, { ...input, unit }, currentBudget, ctx);
      const l = await tx.costAnalysisLine.create({
        data: {
          costItemId: input.costItemId,
          budgetId: costItem.budgetId,
          category: input.category,
          description: input.description,
          unit,
          coefficient: apuDecimal(stored.coefficient),
          unitCost: apuDecimal(stored.unitCost),
          totalCost: apuDecimal(stored.totalCost),
          partidaQuantity:
            stored.partidaQuantity == null ? null : apuDecimal(stored.partidaQuantity),
          isLumpSum: stored.isLumpSum,
          productId: input.productId ?? null,
          sortOrder: input.sortOrder ?? 0,
          supplierContactId: input.supplierContactId ?? null,
          notes: input.notes ?? null,
        },
      });
      const settings = await tx.budgetSettings.findUniqueOrThrow({
        where: { budgetId: costItem.budgetId },
      });
      await _recalcCostItemTotals(tx, input.costItemId, settings);
      await _recalcBudgetSummary(tx, costItem.budgetId);
      await log(
        {
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorUserId,
          action: "cost_analysis_line.added",
          entityType: "CostAnalysisLine",
          entityId: l.id,
          projectId: budget.projectId,
          after: {
            category: input.category,
            description: input.description,
            budgetId: budget.id,
            ...approvedEditOverrideAuditMeta(currentBudget.status),
          },
          ipAddress: ctx.ipAddress,
        },
        tx,
      );
      return l;
    },
    { maxWait: 10_000, timeout: 30_000 },
  );

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
  const { budget } = await _guardLine(existing.costItemId, ctx);

  const updated = await prisma.$transaction(
    async (tx) => {
      const currentBudget = await lockBudgetForEconomicEdit(tx, budget.id, ctx);
      const current = await tx.costAnalysisLine.findFirst({
        where: { id, costItemId: existing.costItemId, budgetId: budget.id },
      });
      if (!current) throw new ServiceError("NOT_FOUND", "Línea de análisis no encontrada");
      const costItemRow = await assertApuItem(tx, current.costItemId, budget.id);
      const newCoefficient =
        input.coefficient !== undefined ? input.coefficient : current.coefficient;
      const newUnitCost = input.unitCost !== undefined ? input.unitCost : current.unitCost;
      const partidaQuantity =
        input.partidaQuantity !== undefined
          ? input.partidaQuantity
          : current.partidaQuantity != null
            ? current.partidaQuantity
            : null;
      const isLumpSum = input.isLumpSum !== undefined ? input.isLumpSum : current.isLumpSum;
      const stored = normalizeApuLineForPersistence(
        {
          coefficient: newCoefficient,
          unitCost: newUnitCost,
          totalCost: input.totalCost ?? current.totalCost,
          partidaQuantity,
          isLumpSum,
        },
        costItemRow.quantity,
      );
      let unit = input.unit !== undefined ? input.unit : current.unit;
      if (isLumpSum) {
        unit = isGlobalUnit(unit) ? unit : APU_GLOBAL_UNIT;
      }

      const productId = input.productId === undefined ? current.productId : input.productId;
      const sameUnitReference =
        productId === current.productId &&
        normalizeProductUnit(unit) === normalizeProductUnit(current.unit);
      await assertApuReferences(
        tx,
        { ...input, productId, unit: sameUnitReference ? undefined : unit },
        currentBudget,
        ctx,
      );

      const l = await tx.costAnalysisLine.update({
        where: { id },
        data: {
          category: input.category,
          description: input.description,
          unit,
          coefficient: apuDecimal(stored.coefficient),
          unitCost: apuDecimal(stored.unitCost),
          totalCost: apuDecimal(stored.totalCost),
          partidaQuantity:
            stored.partidaQuantity == null ? null : apuDecimal(stored.partidaQuantity),
          isLumpSum: stored.isLumpSum,
          productId: input.productId === undefined ? undefined : input.productId,
          sortOrder: input.sortOrder,
          supplierContactId: input.supplierContactId,
          notes: input.notes,
        },
      });
      const settings = await tx.budgetSettings.findUniqueOrThrow({
        where: { budgetId: existing.budgetId },
      });
      await _recalcCostItemTotals(tx, existing.costItemId, settings);
      await _recalcBudgetSummary(tx, existing.budgetId);
      await log(
        {
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorUserId,
          action: "cost_analysis_line.updated",
          entityType: "CostAnalysisLine",
          entityId: id,
          projectId: budget.projectId,
          after: {
            ...input,
            ...approvedEditOverrideAuditMeta(currentBudget.status),
          },
          ipAddress: ctx.ipAddress,
        },
        tx,
      );
      return l;
    },
    { maxWait: 10_000, timeout: 30_000 },
  );

  return updated;
}

export async function removeCostAnalysisLine(id: string, ctx: ServiceContext): Promise<void> {
  if (!can(ctx.roles, "EDIT", "BUDGETS")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions");
  }
  const existing = await prisma.costAnalysisLine.findUnique({ where: { id } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Línea de análisis no encontrada");
  const { budget } = await _guardLine(existing.costItemId, ctx);

  await prisma.$transaction(
    async (tx) => {
      const currentBudget = await lockBudgetForEconomicEdit(tx, budget.id, ctx);
      const current = await tx.costAnalysisLine.findFirst({
        where: { id, costItemId: existing.costItemId, budgetId: budget.id },
      });
      if (!current) throw new ServiceError("NOT_FOUND", "Línea de análisis no encontrada");
      await assertApuItem(tx, current.costItemId, budget.id);
      await assertApuLinesDeletable(tx, [id]);
      await tx.costAnalysisLine.delete({ where: { id } });
      const settings = await tx.budgetSettings.findUniqueOrThrow({
        where: { budgetId: budget.id },
      });
      await _recalcCostItemTotals(tx, existing.costItemId, settings);
      await _recalcBudgetSummary(tx, budget.id);
      await log(
        {
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorUserId,
          action: "cost_analysis_line.removed",
          entityType: "CostAnalysisLine",
          entityId: id,
          projectId: budget.projectId,
          after: {
            budgetId: budget.id,
            ...approvedEditOverrideAuditMeta(currentBudget.status),
          },
          ipAddress: ctx.ipAddress,
        },
        tx,
      );
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
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

  if (input.quantity !== undefined && (!Number.isFinite(input.quantity) || !(input.quantity > 0))) {
    throw new ServiceError("VALIDATION", "La cantidad del ítem debe ser mayor a 0");
  }

  await prisma.$transaction(
    async (tx) => {
      const currentBudget = await lockBudgetForEconomicEdit(tx, budget.id, ctx);
      const currentItem = await assertApuItem(tx, costItem.id, budget.id);
      const newQty =
        input.quantity !== undefined ? apuDecimal(input.quantity) : currentItem.quantity;
      if (!newQty.gt(0)) {
        throw new ServiceError(
          "VALIDATION",
          "Definí una cantidad de ítem mayor a 0 antes de guardar el APU",
        );
      }

      if (input.quantity !== undefined) {
        await assertCostItemQuantityNotBelowCertified(tx, {
          wbsNodeId: currentItem.wbsNodeId,
          tenantId: ctx.tenantId,
          quantity: newQty,
        });
      }
      if (!(input.unit ?? currentItem.unit).trim())
        throw new ServiceError("VALIDATION", "La unidad del ítem es obligatoria");

      await tx.costItem.update({
        where: { id: input.costItemId },
        data: {
          unit: input.unit?.trim(),
          quantity: input.quantity !== undefined ? newQty : undefined,
          notes: input.notes === undefined ? undefined : input.notes,
        },
      });

      // Payload lines normalized against the quantity being saved ([D-047]).
      // Resource: derive coef/totalCost from partidaQuantity (idempotent).
      // Lump: totalCost is unit contribution for itemQtyN (dialog recomputes on qty change).
      const existingLines = await tx.costAnalysisLine.findMany({
        where: { costItemId: input.costItemId },
        select: { id: true, productId: true, unit: true },
      });
      const existingIds = new Set(existingLines.map((line) => line.id));
      const existingById = new Map(existingLines.map((line) => [line.id, line]));
      const referenceProject = await tx.project.findUnique({
        where: { id: currentBudget.projectId },
        select: { companyId: true },
      });
      const referenceCompanyId =
        currentBudget.companyId ?? referenceProject?.companyId ?? ctx.companyId;
      if (referenceCompanyId)
        await tx.$queryRaw`SELECT id FROM companies WHERE id = ${referenceCompanyId} AND "tenantId" = ${ctx.tenantId} FOR KEY SHARE`;
      await lockProductsForUnitReferences(
        tx,
        input.lines
          .filter((line) => !line._delete)
          .map((line) =>
            line.productId === undefined && line.id
              ? existingById.get(line.id)?.productId
              : line.productId,
          )
          .filter((id): id is string => Boolean(id)),
        ctx.tenantId,
      );
      const payloadIds = input.lines.filter((line) => line.id).map((line) => line.id!);
      if (
        new Set(payloadIds).size !== payloadIds.length ||
        payloadIds.some((id) => !existingIds.has(id))
      ) {
        throw new ServiceError(
          "CONFLICT",
          "Las líneas APU deben pertenecer al ítem y aparecer una sola vez. Recargá y volvé a intentar.",
        );
      }
      const keptIds = new Set(
        input.lines.filter((line) => line.id && !line._delete).map((line) => line.id),
      );
      await assertApuLinesDeletable(
        tx,
        [...existingIds].filter((id) => !keptIds.has(id)),
      );

      for (const line of input.lines) {
        if (line._delete) {
          if (line.id && existingIds.has(line.id)) {
            await tx.costAnalysisLine.delete({ where: { id: line.id } });
            existingIds.delete(line.id);
          }
          continue;
        }

        const partidaQuantity = line.partidaQuantity === undefined ? null : line.partidaQuantity;
        const isLumpSum = line.isLumpSum ?? false;
        const normalized = normalizeApuLineForPersistence(
          {
            coefficient: line.coefficient,
            unitCost: line.unitCost,
            totalCost: line.totalCost,
            partidaQuantity,
            isLumpSum,
          },
          newQty,
        );
        let unit = line.unit;
        if (isLumpSum) {
          unit = isGlobalUnit(unit) ? unit : APU_GLOBAL_UNIT;
        }

        const oldLine = line.id ? existingById.get(line.id) : undefined;
        const productId = line.productId === undefined ? oldLine?.productId : line.productId;
        const sameUnitReference =
          oldLine &&
          productId === oldLine.productId &&
          normalizeProductUnit(unit) === normalizeProductUnit(oldLine.unit);
        await assertApuReferences(
          tx,
          { ...line, productId, unit: sameUnitReference ? undefined : unit },
          currentBudget,
          ctx,
        );

        if (line.id && existingIds.has(line.id)) {
          await tx.costAnalysisLine.update({
            where: { id: line.id },
            data: {
              category: line.category,
              description: line.description,
              unit,
              coefficient: apuDecimal(normalized.coefficient),
              unitCost: apuDecimal(normalized.unitCost),
              totalCost: apuDecimal(normalized.totalCost),
              partidaQuantity:
                normalized.partidaQuantity == null ? null : apuDecimal(normalized.partidaQuantity),
              isLumpSum: normalized.isLumpSum,
              productId: line.productId === undefined ? undefined : line.productId,
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
              unit,
              coefficient: apuDecimal(normalized.coefficient),
              unitCost: apuDecimal(normalized.unitCost),
              totalCost: apuDecimal(normalized.totalCost),
              partidaQuantity:
                normalized.partidaQuantity == null ? null : apuDecimal(normalized.partidaQuantity),
              isLumpSum: normalized.isLumpSum,
              productId: line.productId ?? null,
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

      const settings = await tx.budgetSettings.findUniqueOrThrow({
        where: { budgetId: costItem.budgetId },
      });
      await _recalcCostItemTotals(tx, input.costItemId, settings);
      await _recalcBudgetSummary(tx, costItem.budgetId);
      await log(
        {
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorUserId,
          action: "cost_item.apu_saved",
          entityType: "CostItem",
          entityId: input.costItemId,
          projectId: budget.projectId,
          after: {
            budgetId: budget.id,
            lineCount: input.lines.length,
            ...approvedEditOverrideAuditMeta(currentBudget.status),
          },
          ipAddress: ctx.ipAddress,
        },
        tx,
      );
    },
    { maxWait: 10_000, timeout: 30_000 },
  );

  return { ok: true };
}
