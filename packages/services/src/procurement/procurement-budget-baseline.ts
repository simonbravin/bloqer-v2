import { Prisma, prisma } from "@bloqer/database";
import { ServiceError } from "../types";

type DbClient = Prisma.TransactionClient | typeof prisma;

/** Material APU unit cost + CostItem.unit for a WBS ITEM. */
export async function budgetBaselineForWbs(
  wbsNodeId: string,
  db: DbClient = prisma,
): Promise<{ unitCost: Prisma.Decimal | null; unit: string | null; quantity: Prisma.Decimal | null }> {
  const item = await db.costItem.findFirst({
    where: { wbsNodeId },
    select: {
      unit: true,
      quantity: true,
      analysisLines: {
        where: { category: "MATERIAL" },
        select: { unitCost: true, coefficient: true },
      },
    },
  });
  if (!item) return { unitCost: null, unit: null, quantity: null };
  if (item.analysisLines.length === 0) {
    return { unitCost: null, unit: item.unit || null, quantity: item.quantity };
  }
  const unitCost = item.analysisLines.reduce(
    (s, l) => s.plus(new Prisma.Decimal(l.unitCost).times(l.coefficient)),
    new Prisma.Decimal(0),
  );
  return { unitCost, unit: item.unit || null, quantity: item.quantity };
}

/** Material APU unit cost for a WBS ITEM (sum of MATERIAL analysis lines). */
export async function budgetUnitCostForWbs(
  wbsNodeId: string,
  db: DbClient = prisma,
): Promise<Prisma.Decimal | null> {
  const baseline = await budgetBaselineForWbs(wbsNodeId, db);
  return baseline.unitCost;
}

export async function budgetQuantityForWbs(
  wbsNodeId: string,
  db: DbClient = prisma,
): Promise<Prisma.Decimal | null> {
  const baseline = await budgetBaselineForWbs(wbsNodeId, db);
  return baseline.quantity;
}

export type WbsBudgetReference = {
  wbsNodeId: string;
  code: string;
  name: string;
  budgetUnitCost: string | null;
  budgetUnit: string | null;
  budgetQuantity: string | null;
  /** Budgeted material total ≈ unit × qty when both present. */
  budgetedMaterialTotal: string | null;
  committedOnConfirmedPos: string;
  /** budgetedMaterialTotal − committed (null if no baseline). Alert-only in Fase 1. */
  availableSaldo: string | null;
  wouldExceedBudget: boolean;
};

/**
 * Referential cost + open commitment on CONFIRMED+ POs for a WBS node (BR-PUR-011).
 * Soft alert only — does not block by default.
 */
export async function getWbsBudgetReference(
  wbsNodeId: string,
  tenantId: string,
  options?: {
    excludePurchaseOrderId?: string;
    pendingLineTotal?: string;
    db?: DbClient;
  },
): Promise<WbsBudgetReference> {
  const db = options?.db ?? prisma;
  const node = await db.wbsNode.findFirst({
    where: { id: wbsNodeId, budget: { tenantId } },
    select: { id: true, code: true, name: true },
  });
  if (!node) throw new ServiceError("NOT_FOUND", "Nodo WBS no encontrado");

  const baseline = await budgetBaselineForWbs(wbsNodeId, db);
  const unit = baseline.unitCost;
  const qty = baseline.quantity;
  const budgeted = unit && qty ? unit.times(qty) : null;

  const committedAgg = await db.purchaseOrderLine.aggregate({
    where: {
      wbsNodeId,
      purchaseOrder: {
        tenantId,
        status: { in: ["CONFIRMED", "PARTIALLY_RECEIVED", "RECEIVED"] },
        ...(options?.excludePurchaseOrderId
          ? { id: { not: options.excludePurchaseOrderId } }
          : {}),
      },
    },
    _sum: { lineTotal: true },
  });
  const committed = committedAgg._sum.lineTotal ?? new Prisma.Decimal(0);
  const pending = options?.pendingLineTotal
    ? new Prisma.Decimal(options.pendingLineTotal)
    : new Prisma.Decimal(0);
  const projected = committed.plus(pending);

  let availableSaldo: string | null = null;
  let wouldExceedBudget = false;
  if (budgeted) {
    const avail = budgeted.minus(projected);
    availableSaldo = avail.toFixed(4);
    wouldExceedBudget = projected.greaterThan(budgeted);
  }

  return {
    wbsNodeId: node.id,
    code: node.code,
    name: node.name,
    budgetUnitCost: unit?.toFixed(4) ?? null,
    budgetUnit: baseline.unit,
    budgetQuantity: qty?.toFixed(4) ?? null,
    budgetedMaterialTotal: budgeted?.toFixed(4) ?? null,
    committedOnConfirmedPos: committed.toFixed(4),
    availableSaldo,
    wouldExceedBudget,
  };
}

export function assertWbsRequiredOnLines(
  lines: Array<{ wbsNodeId?: string | null }>,
): void {
  for (const line of lines) {
    if (!line.wbsNodeId) {
      throw new ServiceError(
        "VALIDATION",
        "Cada línea de compra debe imputar a un ítem WBS del presupuesto (gastos generales: usar partida de indirectos).",
      );
    }
  }
}
