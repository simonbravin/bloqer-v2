import { Prisma, prisma } from "@bloqer/database";
import { isGlobalUnit, physicalNeedQty } from "@bloqer/domain";
import { ServiceError } from "../types";

type DbClient = Prisma.TransactionClient | typeof prisma;

function normalizeDesc(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export type BudgetLineBaseline = {
  unitCost: Prisma.Decimal | null;
  unit: string | null;
  quantity: Prisma.Decimal | null;
};

type AnalysisLineRow = {
  productId: string | null;
  description: string;
  unit: string;
  unitCost: Prisma.Decimal;
  coefficient: Prisma.Decimal;
  totalCost: Prisma.Decimal;
  partidaQuantity: Prisma.Decimal | null;
  isLumpSum: boolean;
};

/**
 * Match a purchase line to a MATERIAL APU resource line (productId → desc+unit → desc).
 * Returns resource unit + resource unit price + physical need qty — not CostItem.unit.
 */
export async function budgetBaselineForPurchaseLine(
  wbsNodeId: string,
  match: { productId?: string | null; description: string; unit: string },
  db: DbClient = prisma,
): Promise<BudgetLineBaseline> {
  const item = await db.costItem.findFirst({
    where: { wbsNodeId },
    select: {
      quantity: true,
      analysisLines: {
        where: { category: "MATERIAL" },
        select: {
          productId: true,
          description: true,
          unit: true,
          unitCost: true,
          coefficient: true,
          totalCost: true,
          partidaQuantity: true,
          isLumpSum: true,
        },
      },
    },
  });
  if (!item) return { unitCost: null, unit: null, quantity: null };

  const purchasable = item.analysisLines.filter(
    (l) =>
      !l.isLumpSum &&
      !isGlobalUnit(l.unit) &&
      physicalNeedQty(
        l.partidaQuantity != null ? Number(l.partidaQuantity.toString()) : null,
        Number(l.coefficient.toString()),
        Number(item.quantity.toString()),
        { isLumpSum: l.isLumpSum, unit: l.unit },
      ) > 0,
  );

  const pick = (lines: AnalysisLineRow[]): AnalysisLineRow | null => {
    if (match.productId) {
      const byProduct = lines.find((l) => l.productId === match.productId);
      if (byProduct) return byProduct;
    }
    const desc = normalizeDesc(match.description);
    const unit = match.unit.trim().toLowerCase();
    const byDescUnit = lines.find(
      (l) => normalizeDesc(l.description) === desc && l.unit.trim().toLowerCase() === unit,
    );
    if (byDescUnit) return byDescUnit;
    const byDesc = lines.find((l) => normalizeDesc(l.description) === desc);
    return byDesc ?? null;
  };

  const line = pick(purchasable) ?? pick(item.analysisLines);
  if (!line) {
    return { unitCost: null, unit: null, quantity: item.quantity };
  }

  const need = physicalNeedQty(
    line.partidaQuantity != null ? Number(line.partidaQuantity.toString()) : null,
    Number(line.coefficient.toString()),
    Number(item.quantity.toString()),
    { isLumpSum: line.isLumpSum, unit: line.unit },
  );

  return {
    unitCost: line.unitCost,
    unit: line.unit || null,
    quantity: new Prisma.Decimal(need),
  };
}

/**
 * Aggregated purchasable MATERIAL baseline for a WBS ITEM.
 * Money = Σ totalCost×qty of purchasable lines; unitCost = money/qty when qty>0 (partida $/und ítem).
 * Prefer {@link budgetBaselineForPurchaseLine} for OC/SC line variance (resource units).
 */
export async function budgetBaselineForWbs(
  wbsNodeId: string,
  db: DbClient = prisma,
): Promise<BudgetLineBaseline> {
  const item = await db.costItem.findFirst({
    where: { wbsNodeId },
    select: {
      unit: true,
      quantity: true,
      analysisLines: {
        where: { category: "MATERIAL" },
        select: {
          unitCost: true,
          coefficient: true,
          totalCost: true,
          partidaQuantity: true,
          isLumpSum: true,
          unit: true,
        },
      },
    },
  });
  if (!item) return { unitCost: null, unit: null, quantity: null };
  if (item.analysisLines.length === 0) {
    return { unitCost: null, unit: item.unit || null, quantity: item.quantity };
  }

  let partidaMoney = new Prisma.Decimal(0);
  for (const l of item.analysisLines) {
    const need = physicalNeedQty(
      l.partidaQuantity != null ? Number(l.partidaQuantity.toString()) : null,
      Number(l.coefficient.toString()),
      Number(item.quantity.toString()),
      { isLumpSum: l.isLumpSum, unit: l.unit },
    );
    if (need <= 0) continue;
    partidaMoney = partidaMoney.plus(new Prisma.Decimal(l.totalCost).times(item.quantity));
  }

  if (partidaMoney.isZero()) {
    return { unitCost: null, unit: item.unit || null, quantity: item.quantity };
  }

  const unitCost = item.quantity.gt(0)
    ? partidaMoney.div(item.quantity)
    : partidaMoney;

  return { unitCost, unit: item.unit || null, quantity: item.quantity };
}

/** Material APU unit cost for a WBS ITEM (sum of purchasable MATERIAL analysis lines). */
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
  /** Budgeted purchasable material total (excludes gl / legacy lump). */
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
