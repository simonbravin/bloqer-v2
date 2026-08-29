import { Prisma, type CostCategory } from "@bloqer/database";

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
 * Explicit input wins; else APU category; else MATERIAL default.
 */
export function resolveLineCostType(input: {
  costType?: CostCategory | null;
  apuCategory?: CostCategory | null;
}): CostCategory {
  if (input.costType) return input.costType;
  if (input.apuCategory) return input.apuCategory;
  return "MATERIAL";
}

/** Inventory consumption always MATERIAL. */
export function inventoryCostType(): CostCategory {
  return "MATERIAL";
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
