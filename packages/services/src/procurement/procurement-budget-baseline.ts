import { Prisma, prisma } from "@bloqer/database";
import { isGlobalUnit } from "@bloqer/domain";
import { ServiceError } from "../types";
import type { ServiceContext } from "../types";
import { companyScopeFilter } from "../company-scope";
import { serializeMoneyDecimal } from "../finance/money-decimal";
import { needQtyFromApuLineExact } from "../materials/material-commitment-pure";

type DbClient = Prisma.TransactionClient | typeof prisma;

function normalizeDesc(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export type SuggestedApuRef = {
  description: string;
  unit: string;
  unitCost: string;
};

export type BudgetLineBaseline = {
  currency: string | null;
  unitCost: Prisma.Decimal | null;
  unit: string | null;
  quantity: Prisma.Decimal | null;
  /** Same-unit purchasable APU when the line did not match one (display only). */
  suggestedApu?: SuggestedApuRef | null;
};

function suggestedApuForUnmatched(
  purchasable: AnalysisLineRow[],
  lineUnit: string,
): SuggestedApuRef | null {
  const unit = lineUnit.trim().toLowerCase();
  if (!unit) return null;
  const sameUnit = purchasable.filter((l) => l.unit.trim().toLowerCase() === unit);
  if (sameUnit.length !== 1) return null;
  const hit = sameUnit[0]!;
  return {
    description: hit.description,
    unit: hit.unit,
    unitCost: hit.unitCost.toFixed(4),
  };
}

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

type CostItemDirectFields = {
  unit: string | null;
  quantity: Prisma.Decimal;
  unitCostDirect: Prisma.Decimal;
};

/**
 * When the WBS item has no purchasable MATERIAL APU, use CostItem.unitCostDirect
 * (costo dir. /u of the partida — labor/equipment/sub included) as the purchase referential.
 */
export function fallbackBudgetFromCostItem(item: CostItemDirectFields): BudgetLineBaseline {
  return {
    currency: null,
    unitCost: item.unitCostDirect.greaterThan(0) ? item.unitCostDirect : null,
    unit: item.unit?.trim() ? item.unit : null,
    quantity: item.quantity,
  };
}

/**
 * When no APU insumo matches the PO line: use CostItem $/u only if that unit is
 * comparable (not a lump-sum `gl` total). Keep `unit: gl` so variance can skip
 * the false UNIT_MISMATCH of un/kg vs global.
 */
export function unmatchedPurchaseLineBaseline(item: CostItemDirectFields): BudgetLineBaseline {
  if (isGlobalUnit(item.unit)) {
    return {
      currency: null,
      unitCost: null,
      unit: item.unit,
      quantity: item.quantity,
    };
  }
  return fallbackBudgetFromCostItem(item);
}

function physicalPurchaseNeed(line: AnalysisLineRow, itemQuantity: Prisma.Decimal): Prisma.Decimal {
  return needQtyFromApuLineExact({ ...line, itemQuantity });
}

function assertBaselineGraph(item: { budgetId: string; wbsNode: { budgetId: string }; analysisLines: Array<{ budgetId: string }> }): void {
  if (item.budgetId !== item.wbsNode.budgetId || item.analysisLines.some((line) => line.budgetId !== item.budgetId)) {
    throw new ServiceError("CONFLICT", "La partida y su análisis de costo tienen relaciones presupuestarias inconsistentes");
  }
}

/**
 * Explicit APU hint (including LAB/EQ) takes precedence. Without a hint, match
 * a MATERIAL resource by productId → desc+unit → desc.
 * Returns resource unit + resource unit price + physical need qty — not CostItem.unit.
 * If nothing matches, falls back to CostItem.unitCostDirect ([BR-PUR-011]).
 */
export async function budgetBaselineForPurchaseLine(
  wbsNodeId: string,
  match: {
    productId?: string | null;
    description: string;
    unit: string;
    costAnalysisLineId?: string | null;
  },
  db: DbClient = prisma,
): Promise<BudgetLineBaseline> {
  const item = await db.costItem.findFirst({
    where: { wbsNodeId },
    select: {
      budgetId: true,
      wbsNode: { select: { budgetId: true, budget: { select: { currency: true } } } },
      unit: true,
      quantity: true,
      unitCostDirect: true,
      analysisLines: {
        select: {
          id: true,
          budgetId: true,
          category: true,
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
  if (!item) return { currency: null, unitCost: null, unit: null, quantity: null };
  assertBaselineGraph(item);
  const currency = item.wbsNode.budget.currency;

  if (match.costAnalysisLineId) {
    const byId = item.analysisLines.find((l) => l.id === match.costAnalysisLineId);
    if (byId) {
      const need = physicalPurchaseNeed(byId, item.quantity);
      return {
        currency,
        unitCost: byId.unitCost,
        unit: byId.unit || null,
        quantity: need,
      };
    }
    throw new ServiceError("CONFLICT", "El insumo APU no pertenece a la partida EDT seleccionada");
  }

  // Explicit LAB/EQ hints above retain their own resource; fallback stays MATERIAL.
  const materials = item.analysisLines.filter((line) => line.category === "MATERIAL");
  const purchasable = materials.filter(
    (l) =>
      !l.isLumpSum &&
      !isGlobalUnit(l.unit) &&
      physicalPurchaseNeed(l, item.quantity).gt(0),
  );

  const pick = (lines: AnalysisLineRow[]): AnalysisLineRow | null => {
    if (match.productId) {
      const matchingProducts = lines.filter((line) => line.productId === match.productId);
      const byProduct = matchingProducts.find((line) => line.unit.trim().toLowerCase() === match.unit.trim().toLowerCase()) ?? (matchingProducts.length === 1 ? matchingProducts[0] : null);
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

  const line = pick(purchasable) ?? pick(materials);
  if (!line) {
    return {
      ...unmatchedPurchaseLineBaseline(item),
      currency,
      suggestedApu: suggestedApuForUnmatched(purchasable, match.unit),
    };
  }

  const need = physicalPurchaseNeed(line, item.quantity);

  return {
    currency,
    unitCost: line.unitCost,
    unit: line.unit || null,
    quantity: need,
  };
}

/**
 * Aggregated purchasable MATERIAL baseline for a WBS ITEM.
 * Money = Σ totalCost×qty of purchasable lines; unitCost = money/qty when qty>0 (partida $/und ítem).
 * If there is no purchasable MATERIAL money, falls back to CostItem.unitCostDirect.
 * Prefer {@link budgetBaselineForPurchaseLine} for OC/SC line variance (resource units).
 */
export async function budgetBaselineForWbs(
  wbsNodeId: string,
  db: DbClient = prisma,
): Promise<BudgetLineBaseline> {
  const item = await db.costItem.findFirst({
    where: { wbsNodeId },
    select: {
      budgetId: true,
      wbsNode: { select: { budgetId: true, budget: { select: { currency: true } } } },
      unit: true,
      quantity: true,
      unitCostDirect: true,
      analysisLines: {
        where: { category: "MATERIAL" },
        select: {
          budgetId: true,
          productId: true,
          description: true,
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
  if (!item) return { currency: null, unitCost: null, unit: null, quantity: null };
  assertBaselineGraph(item);
  const currency = item.wbsNode.budget.currency;
  if (item.analysisLines.length === 0) {
    return { ...fallbackBudgetFromCostItem(item), currency };
  }

  let partidaMoney = new Prisma.Decimal(0);
  for (const l of item.analysisLines) {
    const need = physicalPurchaseNeed(l, item.quantity);
    if (need.lte(0)) continue;
    partidaMoney = partidaMoney.plus(new Prisma.Decimal(l.totalCost).times(item.quantity));
  }

  if (partidaMoney.isZero()) {
    return { ...fallbackBudgetFromCostItem(item), currency };
  }

  const unitCost = item.quantity.gt(0)
    ? partidaMoney.div(item.quantity)
    : partidaMoney;

  return { currency, unitCost, unit: item.unit || null, quantity: item.quantity };
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
  /** Net committed on CONFIRMED+ POs (lineSubtotal, sin IVA) — comparable a budgetedMaterialTotal. */
  committedOnConfirmedPos: string | null;
  budgetCurrency: string;
  currencyWarning: string | null;
  /** budgetedMaterialTotal − committed neto (null if no baseline). Alert-only in Fase 1. */
  availableSaldo: string | null;
  wouldExceedBudget: boolean;
};

/**
 * Referential cost + open commitment on CONFIRMED+ POs for a WBS node (BR-PUR-011).
 * Committed amounts use lineSubtotal (neto, sin IVA) so they compare apples-to-apples
 * against budgetedMaterialTotal from the APU.
 * Soft alert only — does not block by default.
 */
export async function getWbsBudgetReference(
  wbsNodeId: string,
  tenantId: string,
  options?: {
    excludePurchaseOrderId?: string;
    /** Pending PO line subtotal (neto) for this WBS, not yet confirmed. */
    pendingLineSubtotal?: string;
    pendingCurrency?: string | null;
    /** @deprecated Use pendingLineSubtotal (neto). Kept for callers passing lineSubtotal values. */
    pendingLineTotal?: string;
    db?: DbClient;
    ctx?: ServiceContext;
  },
): Promise<WbsBudgetReference> {
  const db = options?.db ?? prisma;
  const node = await db.wbsNode.findFirst({
    where: { id: wbsNodeId, budget: { tenantId, ...(options?.ctx ? companyScopeFilter(options.ctx) : {}) } },
    select: { id: true, code: true, name: true, budget: { select: { currency: true, companyId: true, projectId: true } } },
  });
  if (!node) throw new ServiceError("NOT_FOUND", "Ítem EDT no encontrado");

  const baseline = await budgetBaselineForWbs(wbsNodeId, db);
  const unit = baseline.unitCost;
  const qty = baseline.quantity;
  const budgeted = unit && qty ? unit.times(qty) : null;

  const referenceCompanyId = options?.ctx?.companyId ?? node.budget.companyId;
  const commitments = await db.purchaseOrderLine.findMany({
    where: {
      wbsNodeId,
      purchaseOrder: {
        tenantId,
        ...(referenceCompanyId ? { companyId: referenceCompanyId } : {}), // companyId NOT NULL
        status: { in: ["CONFIRMED", "PARTIALLY_RECEIVED", "RECEIVED"] },
        ...(options?.excludePurchaseOrderId
          ? { id: { not: options.excludePurchaseOrderId } }
          : {}),
      },
    },
    select: { lineSubtotal: true, purchaseOrder: { select: { currency: true, projectId: true } } },
  });
  if (commitments.some((line) => line.purchaseOrder.projectId !== node.budget.projectId)) {
    throw new ServiceError("CONFLICT", "Los compromisos de la partida tienen relaciones inconsistentes con su obra");
  }
  const committed = commitments.reduce((sum, line) => sum.plus(line.lineSubtotal), new Prisma.Decimal(0));
  const pendingRaw = options?.pendingLineSubtotal ?? options?.pendingLineTotal;
  const pending = pendingRaw
    ? new Prisma.Decimal(pendingRaw)
    : new Prisma.Decimal(0);
  const projected = committed.plus(pending);
  const currencyComparable = Boolean(node.budget.currency) && commitments.every((line) => line.purchaseOrder.currency === node.budget.currency) &&
    (!pendingRaw || pending.isZero() || options?.pendingCurrency === node.budget.currency);
  const currencyWarning = currencyComparable ? null : "El saldo de la partida no se puede calcular: presupuesto y compromisos no tienen una moneda comparable. No se convierten ni se omiten importes.";

  let availableSaldo: string | null = null;
  let wouldExceedBudget = false;
  if (budgeted && currencyComparable) {
    const avail = budgeted.minus(projected);
    availableSaldo = serializeMoneyDecimal(avail);
    wouldExceedBudget = projected.greaterThan(budgeted);
  }

  return {
    wbsNodeId: node.id,
    code: node.code,
    name: node.name,
    budgetUnitCost: unit?.toFixed(4) ?? null,
    budgetUnit: baseline.unit,
    budgetQuantity: qty?.toFixed(4) ?? null,
    budgetedMaterialTotal: budgeted != null ? serializeMoneyDecimal(budgeted) : null,
    committedOnConfirmedPos: currencyComparable ? serializeMoneyDecimal(committed) : null,
    budgetCurrency: node.budget.currency,
    currencyWarning,
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
        "Cada línea de compra debe imputar a un ítem EDT del presupuesto (gastos generales: usar partida de indirectos).",
      );
    }
  }
}
