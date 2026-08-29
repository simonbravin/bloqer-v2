import { Prisma, prisma, type CostCategory } from "@bloqer/database";

/** Canonical job-cost natures for EDT partida × cost type ([D-099]). */
export const COST_TYPE_ORDER: CostCategory[] = [
  "MATERIAL",
  "LABOR",
  "EQUIPMENT",
  "SUBCONTRACT",
  "OTHER",
];

export const COST_TYPE_LABELS_ES: Record<CostCategory, string> = {
  MATERIAL: "Materiales",
  LABOR: "Mano de obra",
  EQUIPMENT: "Equipos",
  SUBCONTRACT: "Subcontratos",
  OTHER: "Otros",
};

/**
 * Resolve persisted costType for a procurement / AP line ([D-099]).
 *
 * Priority:
 *  1. Explicit input from the caller (user picked a type in the form).
 *  2. APU category of the picked insumo APU (baño químico = EQP → EQP).
 *  3. APU-derived **dominant** CostCategory of the partida when no insumo APU
 *     was selected (helps flows without a costType selector, e.g. purchase
 *     requests that only reference the WBS node).
 *  4. Fallback: MATERIAL.
 */
export function resolveLineCostType(input: {
  costType?: CostCategory | null;
  apuCategory?: CostCategory | null;
  wbsDominantCostType?: CostCategory | null;
}): CostCategory {
  if (input.costType) return input.costType;
  if (input.apuCategory) return input.apuCategory;
  if (input.wbsDominantCostType) return input.wbsDominantCostType;
  return "MATERIAL";
}

/** Inventory consumption always MATERIAL. */
export function inventoryCostType(): CostCategory {
  return "MATERIAL";
}

/**
 * Given the analysisLines of an ITEM's APU, return the CostCategory that
 * concentrates ≥ 60% of the total cost, or the sole category present.
 * Returns null when the APU is empty, all-zero, or genuinely mixed.
 *
 * Used by procurement flows to pre-select `costType` when the user picks a
 * partida without picking a specific insumo APU ([D-099]).
 *
 * Weighs by `totalCost` (the persisted per-line amount that already accounts
 * for coefficient × unitCost / lump sums).
 */
export function computeDominantCostTypeFromApuLines(
  lines: ReadonlyArray<{ category: CostCategory; totalCost: unknown }>,
): CostCategory | null {
  if (lines.length === 0) return null;
  const totals = new Map<CostCategory, Prisma.Decimal>();
  let grand = new Prisma.Decimal(0);
  for (const l of lines) {
    let dec: Prisma.Decimal;
    try {
      dec = l.totalCost instanceof Prisma.Decimal
        ? l.totalCost
        : new Prisma.Decimal(String(l.totalCost ?? 0));
    } catch {
      continue;
    }
    if (dec.isNaN() || dec.lessThanOrEqualTo(0)) continue;
    totals.set(l.category, (totals.get(l.category) ?? new Prisma.Decimal(0)).plus(dec));
    grand = grand.plus(dec);
  }
  if (grand.lessThanOrEqualTo(0)) return null;
  if (totals.size === 1) return [...totals.keys()][0]!;
  const threshold = grand.times(0.6);
  for (const [cat, sum] of totals) {
    if (sum.greaterThanOrEqualTo(threshold)) return cat;
  }
  return null;
}

/**
 * Load the APU-derived dominant CostCategory for a set of WBS ITEM ids.
 * Returns an entry per wbs id, with null for mixed / empty APUs.
 * Tenant-scoped for safety.
 */
export async function loadWbsDominantCostTypes(
  wbsNodeIds: string[],
  tenantId: string,
): Promise<Map<string, CostCategory | null>> {
  const result = new Map<string, CostCategory | null>();
  if (wbsNodeIds.length === 0) return result;

  const rows = await prisma.wbsNode.findMany({
    where: { id: { in: wbsNodeIds }, budget: { project: { tenantId } } },
    select: {
      id: true,
      costItem: {
        select: {
          analysisLines: {
            select: { category: true, totalCost: true },
          },
        },
      },
    },
  });

  for (const r of rows) {
    result.set(r.id, computeDominantCostTypeFromApuLines(r.costItem?.analysisLines ?? []));
  }
  for (const id of wbsNodeIds) if (!result.has(id)) result.set(id, null);
  return result;
}

/** Subcontract commitment / certification always SUBCONTRACT. */
export function subcontractCostType(): CostCategory {
  return "SUBCONTRACT";
}

/**
 * Heaviest committed CostCategory per WBS across a set of PO lines ([D-099]).
 * Invoice lines without an OC line FK still consume that partida's commitment, so they must
 * discount the bucket where the money was actually committed instead of their own type.
 */
export function dominantCostTypeByWbs(
  lines: Array<{
    wbsNodeId: string | null;
    lineSubtotal: Prisma.Decimal;
    costType: CostCategory | null;
  }>,
): Map<string, CostCategory> {
  const weights = new Map<string, Map<CostCategory, Prisma.Decimal>>();
  for (const line of lines) {
    if (!line.wbsNodeId) continue;
    const type = resolveLineCostType({ costType: line.costType, apuCategory: null });
    let byType = weights.get(line.wbsNodeId);
    if (!byType) {
      byType = new Map();
      weights.set(line.wbsNodeId, byType);
    }
    byType.set(type, (byType.get(type) ?? new Prisma.Decimal(0)).add(line.lineSubtotal));
  }

  const dominant = new Map<string, CostCategory>();
  for (const [wbsId, byType] of weights) {
    let best: CostCategory | null = null;
    let bestAmount: Prisma.Decimal | null = null;
    for (const cat of COST_TYPE_ORDER) {
      const amount = byType.get(cat);
      if (!amount) continue;
      if (!bestAmount || amount.gt(bestAmount)) {
        best = cat;
        bestAmount = amount;
      }
    }
    if (best) dominant.set(wbsId, best);
  }
  return dominant;
}
