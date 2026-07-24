import {
  linePartidaMoney,
  lineUnitContribution,
  resourceQtyDisplay,
  type ApuDisplayLine,
  type ResourceQtyDisplay,
} from "@bloqer/domain";
import type { CostAnalysisLineView } from "@bloqer/services";
import { VISIBLE_COST_CATEGORIES, type VisibleCostCategory } from "@/lib/budget-categories";

const VISIBLE = new Set<string>(VISIBLE_COST_CATEGORIES);

export function visibleApuLines(lines: CostAnalysisLineView[]): CostAnalysisLineView[] {
  return lines
    .filter((l) => VISIBLE.has(l.category))
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.description.localeCompare(b.description));
}

export function toApuDisplayLine(line: CostAnalysisLineView): ApuDisplayLine {
  return {
    coefficient: parseFloat(line.coefficient) || 0,
    unitCost: parseFloat(line.unitCost) || 0,
    totalCost: parseFloat(line.totalCost) || 0,
    partidaQuantity:
      line.partidaQuantity == null || line.partidaQuantity === ""
        ? null
        : parseFloat(line.partidaQuantity),
    isLumpSum: Boolean(line.isLumpSum),
  };
}

export function apuResourceQtyDisplay(
  line: CostAnalysisLineView,
  itemQuantity: number,
): ResourceQtyDisplay {
  return resourceQtyDisplay(toApuDisplayLine(line), itemQuantity);
}

export function apuLinePartidaMoney(line: CostAnalysisLineView, itemQuantity: number): number {
  return linePartidaMoney(parseFloat(line.totalCost) || 0, itemQuantity);
}

export function apuLineUnitContribution(line: CostAnalysisLineView): number {
  return lineUnitContribution(parseFloat(line.totalCost) || 0);
}

export function apuLineMatchesSearch(line: CostAnalysisLineView, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return line.description.toLowerCase().includes(q);
}

export function apuCategoryShort(category: string): string {
  const map: Record<VisibleCostCategory, string> = {
    MATERIAL: "MAT",
    LABOR: "MO",
    EQUIPMENT: "EQ",
    SUBCONTRACT: "SUB",
  };
  return map[category as VisibleCostCategory] ?? category.slice(0, 3);
}

export function leafHasVisibleApu(lines: CostAnalysisLineView[] | undefined): boolean {
  return visibleApuLines(lines ?? []).length > 0;
}
