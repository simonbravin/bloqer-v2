import { addDecimal, multiplyDecimal } from "@bloqer/utils";
import { serializeMoneyDecimal } from "../finance/money-decimal";

export type PurchaseRequestEstimatedAmountSource = "budget" | "quote" | "orders";

export type PurchaseRequestLineForList = {
  wbsNodeId: string | null;
  wbsNodeCode: string | null;
  wbsNodeName: string | null;
  costAnalysisLineId: string | null;
  description: string;
  quantity: string;
  budgetUnitCostSnapshot: string | null;
  /** Live APU unit cost when snapshot not yet captured (DRAFT). */
  apuUnitCost: string | null;
  /** Currency of the owning budget; never infer ARS for a native APU value. */
  budgetCurrency?: string | null;
};

function resolveApuLineUnitCost(line: PurchaseRequestLineForList, draft: boolean): string | null {
  if (line.budgetUnitCostSnapshot != null) return line.budgetUnitCostSnapshot;
  if (draft && line.costAnalysisLineId && line.apuUnitCost != null) return line.apuUnitCost;
  return null;
}

export function computeLineSummaries(lines: PurchaseRequestLineForList[]): {
  primaryWbsNodeCode: string | null;
  primaryWbsNodeName: string | null;
  hasMultipleWbs: boolean;
  linesCount: number;
  firstLineDescription: string | null;
} {
  const linesCount = lines.length;
  const first = lines[0];
  const wbsIds = new Set(lines.map((l) => l.wbsNodeId).filter(Boolean));
  const primaryLine = lines.find((l) => l.wbsNodeCode) ?? first;
  return {
    primaryWbsNodeCode: primaryLine?.wbsNodeCode ?? null,
    primaryWbsNodeName: primaryLine?.wbsNodeName ?? null,
    hasMultipleWbs: wbsIds.size > 1,
    linesCount,
    firstLineDescription: first?.description?.trim() || null,
  };
}

/**
 * Prefer Σ active award POs (ARS) when any exist; else legacy single selected quote total;
 * else APU budget estimate.
 */
export function computeEstimatedAmount(
  pr: { status: string },
  lines: PurchaseRequestLineForList[],
  selectedQuote: { totalAmount: string; currency: string } | null,
  activeOrderTotalsArs?: string[] | null,
): {
  estimatedAmount: string | null;
  estimatedAmountCurrency: string | null;
  estimatedAmountSource: PurchaseRequestEstimatedAmountSource | null;
} {
  if (activeOrderTotalsArs && activeOrderTotalsArs.length > 0) {
    let total = "0";
    for (const amount of activeOrderTotalsArs) {
      total = addDecimal(total, amount);
    }
    return {
      estimatedAmount: serializeMoneyDecimal(total),
      estimatedAmountCurrency: "ARS",
      estimatedAmountSource: "orders",
    };
  }

  if (
    (pr.status === "QUOTE_SELECTED" || pr.status === "COMPLETED") &&
    selectedQuote
  ) {
    return {
      estimatedAmount: serializeMoneyDecimal(selectedQuote.totalAmount),
      estimatedAmountCurrency: selectedQuote.currency,
      estimatedAmountSource: "quote",
    };
  }

  if (lines.length === 0) {
    return { estimatedAmount: null, estimatedAmountCurrency: null, estimatedAmountSource: null };
  }

  // Only APU-bound lines count — not the aggregated WBS item cost ([D-068]).
  const apuLines = lines.filter((l) => l.costAnalysisLineId);
  if (apuLines.length !== lines.length) {
    return { estimatedAmount: null, estimatedAmountCurrency: null, estimatedAmountSource: null };
  }

  const currencies = new Set(apuLines.map((line) => line.budgetCurrency));
  const currency = apuLines[0]?.budgetCurrency;
  const draft = pr.status === "DRAFT";
  const allHaveUnitCost = apuLines.every((l) => resolveApuLineUnitCost(l, draft) != null);
  if (!allHaveUnitCost || !currency || currencies.size !== 1) {
    return { estimatedAmount: null, estimatedAmountCurrency: null, estimatedAmountSource: null };
  }

  let total = "0";
  for (const line of apuLines) {
    const unit = resolveApuLineUnitCost(line, draft)!;
    total = addDecimal(total, multiplyDecimal(line.quantity, unit));
  }

  return {
    estimatedAmount: serializeMoneyDecimal(total),
    estimatedAmountCurrency: currency,
    estimatedAmountSource: "budget",
  };
}
