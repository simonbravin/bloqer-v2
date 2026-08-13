import { Prisma } from "@bloqer/database";
import { physicalNeedQty } from "@bloqer/domain";
import { serializeMoneyDecimal, serializeQtyDecimal } from "../finance/money-decimal";

/** PO statuses that count as committed demand (materials board / SC-OC prefill). */
export const MATERIAL_ORDERED_PO_STATUSES = [
  "CONFIRMED",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
] as const;

/** SC statuses that count when no CONFIRMED+ OC exists for that request. */
export const MATERIAL_ORDERED_PR_STATUSES = ["SUBMITTED", "QUOTE_SELECTED"] as const;

const ZERO = new Prisma.Decimal(0);

export function normalizeMaterialDesc(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Fallback match key when costAnalysisLineId is absent. */
export function materialFallbackRowKey(
  wbsNodeId: string,
  productId: string | null,
  description: string,
): string {
  return `${wbsNodeId}::${productId ?? `d:${normalizeMaterialDesc(description)}`}`;
}

export type MaterialNeedSeed = {
  wbsNodeId: string;
  costAnalysisLineId: string;
  productId: string | null;
  description: string;
  unit: string;
  unitCost: string;
  needQty: number;
  needCost: number;
};

export type MaterialCommitmentAgg = {
  wbsNodeId: string;
  costAnalysisLineId: string;
  productId: string | null;
  description: string;
  unit: string;
  unitCost: string;
  needQty: Prisma.Decimal;
  needCost: Prisma.Decimal;
  orderedQty: Prisma.Decimal;
  receivedQty: Prisma.Decimal;
};

export type MaterialOrderedInput = {
  wbsNodeId: string;
  costAnalysisLineId: string | null;
  productId: string | null;
  description: string;
  quantity: number | string | Prisma.Decimal;
  receivedQuantity?: number | string | Prisma.Decimal;
};

function toDec(v: number | string | Prisma.Decimal): Prisma.Decimal {
  if (typeof v === "string" || typeof v === "number") return new Prisma.Decimal(v);
  // Never `instanceof Prisma.Decimal`: duplicate decimal.js copies make it fail,
  // and `new Decimal(foreign)` may coerce via valueOf() (IEEE float).
  return new Prisma.Decimal(v.toString());
}

/**
 * Build APU-keyed commitment map from budget material needs.
 * One entry per CostAnalysisLine id ([D-068]).
 */
export function buildApuCommitmentMap(
  seeds: MaterialNeedSeed[],
): Map<string, MaterialCommitmentAgg> {
  const map = new Map<string, MaterialCommitmentAgg>();
  for (const s of seeds) {
    if (!(s.needQty > 0)) continue;
    map.set(s.costAnalysisLineId, {
      wbsNodeId: s.wbsNodeId,
      costAnalysisLineId: s.costAnalysisLineId,
      productId: s.productId,
      description: s.description,
      unit: s.unit,
      unitCost: s.unitCost,
      needQty: new Prisma.Decimal(s.needQty),
      needCost: new Prisma.Decimal(s.needCost),
      orderedQty: ZERO,
      receivedQty: ZERO,
    });
  }
  return map;
}

/** Secondary index: fallback row key → APU id when unique. */
export function buildFallbackIndex(
  map: Map<string, MaterialCommitmentAgg>,
): Map<string, string> {
  const counts = new Map<string, string[]>();
  for (const agg of map.values()) {
    const key = materialFallbackRowKey(agg.wbsNodeId, agg.productId, agg.description);
    const list = counts.get(key) ?? [];
    list.push(agg.costAnalysisLineId);
    counts.set(key, list);
  }
  const index = new Map<string, string>();
  for (const [key, ids] of counts) {
    if (ids.length === 1) index.set(key, ids[0]!);
  }
  return index;
}

/**
 * Attribute an ordered PR/PO line onto APU commitments.
 * Prefer costAnalysisLineId; else unique fallback key (product/desc).
 * Returns false when no APU row matched (orphan order — ignore for APU prefill).
 */
export function applyOrderedToApuMap(
  map: Map<string, MaterialCommitmentAgg>,
  fallbackIndex: Map<string, string>,
  line: MaterialOrderedInput,
): boolean {
  let apuId: string | null = line.costAnalysisLineId;
  if (apuId && !map.has(apuId)) apuId = null;
  if (!apuId) {
    const key = materialFallbackRowKey(line.wbsNodeId, line.productId, line.description);
    apuId = fallbackIndex.get(key) ?? null;
  }
  if (!apuId) return false;
  const row = map.get(apuId);
  if (!row) return false;
  row.orderedQty = row.orderedQty.add(toDec(line.quantity));
  if (line.receivedQuantity != null) {
    row.receivedQty = row.receivedQty.add(toDec(line.receivedQuantity));
  }
  return true;
}

export function shortfallOf(needQty: Prisma.Decimal, orderedQty: Prisma.Decimal): Prisma.Decimal {
  return Prisma.Decimal.max(ZERO, needQty.sub(orderedQty));
}

export type MaterialApuCommitmentView = {
  wbsNodeId: string;
  costAnalysisLineId: string;
  productId: string | null;
  description: string;
  unit: string;
  unitCost: string;
  needQty: string;
  needCost: string;
  orderedQty: string;
  receivedQty: string;
  shortfallQty: string;
  overCommitted: boolean;
};

export function serializeApuCommitment(agg: MaterialCommitmentAgg): MaterialApuCommitmentView {
  const shortfall = shortfallOf(agg.needQty, agg.orderedQty);
  return {
    wbsNodeId: agg.wbsNodeId,
    costAnalysisLineId: agg.costAnalysisLineId,
    productId: agg.productId,
    description: agg.description,
    unit: agg.unit,
    unitCost: agg.unitCost,
    needQty: serializeQtyDecimal(agg.needQty),
    needCost: serializeMoneyDecimal(agg.needCost),
    orderedQty: serializeQtyDecimal(agg.orderedQty),
    receivedQty: serializeQtyDecimal(agg.receivedQty),
    shortfallQty: serializeQtyDecimal(shortfall),
    overCommitted: agg.orderedQty.greaterThan(agg.needQty) && agg.needQty.greaterThan(0),
  };
}

/** Derive physical need for a MATERIAL APU line ([D-047]). */
export function needQtyFromApuLine(input: {
  partidaQuantity: number | null;
  coefficient: number;
  itemQuantity: number;
  isLumpSum: boolean;
  unit: string;
}): number {
  return physicalNeedQty(input.partidaQuantity, input.coefficient, input.itemQuantity, {
    isLumpSum: input.isLumpSum,
    unit: input.unit,
  });
}
