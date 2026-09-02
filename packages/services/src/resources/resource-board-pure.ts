import type { CostCategory } from "@bloqer/database";

/** Cost categories with APU operational boards (not MATERIAL / SUBCONTRACT). */
export const RESOURCE_BOARD_CATEGORIES = ["LABOR", "EQUIPMENT"] as const;

export type ResourceBoardCategory = (typeof RESOURCE_BOARD_CATEGORIES)[number];

export function isResourceBoardCategory(v: string): v is ResourceBoardCategory {
  return (RESOURCE_BOARD_CATEGORIES as readonly string[]).includes(v);
}

export const RESOURCE_BOARD_LABELS_ES: Record<ResourceBoardCategory, string> = {
  LABOR: "Mano de obra",
  EQUIPMENT: "Equipos",
};

export const RESOURCE_BOARD_ROUTE_SEGMENT: Record<ResourceBoardCategory, "mano-obra" | "equipos"> = {
  LABOR: "mano-obra",
  EQUIPMENT: "equipos",
};

export function resourceBoardFromParam(segment: "mano-obra" | "equipos"): ResourceBoardCategory {
  return segment === "mano-obra" ? "LABOR" : "EQUIPMENT";
}

/** CostCategory for filters that already validated LAB|EQP. */
export function asCostCategory(c: ResourceBoardCategory): CostCategory {
  return c;
}

export function normalizeResourceDesc(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Fallback match key when costAnalysisLineId is absent (no product axis for LAB/EQP). */
export function resourceFallbackRowKey(wbsNodeId: string, description: string): string {
  return `${wbsNodeId}::d:${normalizeResourceDesc(description)}`;
}

export function resourceRowKey(wbsNodeId: string, costAnalysisLineId: string | null, description: string): string {
  if (costAnalysisLineId) return `${wbsNodeId}::apu:${costAnalysisLineId}`;
  return resourceFallbackRowKey(wbsNodeId, description);
}

/**
 * Coverage shortfall for resource boards ([D-099]).
 * covered = max(ordered, invoiced); shortfall = max(0, need − covered).
 */
export function resourceCoverageShortfall(
  needQty: number,
  orderedQty: number,
  invoicedQty: number,
): number {
  const covered = Math.max(orderedQty, invoicedQty);
  return Math.max(0, needQty - covered);
}
