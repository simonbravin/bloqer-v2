import { addDecimal, multiplyDecimal } from "@bloqer/utils";
import { serializeMoneyDecimal } from "../finance/money-decimal";

export type PurchaseRequestEstimatedAmountSource = "budget" | "quote";

export type PurchaseRequestLineForList = {
  wbsNodeId: string | null;
  wbsNodeCode: string | null;
  wbsNodeName: string | null;
  description: string;
  quantity: string;
  budgetUnitCostSnapshot: string | null;
};

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

export function computeEstimatedAmount(
  pr: { status: string },
  lines: PurchaseRequestLineForList[],
  selectedQuote: { totalAmount: string; currency: string } | null,
): {
  estimatedAmount: string | null;
  estimatedAmountCurrency: string | null;
  estimatedAmountSource: PurchaseRequestEstimatedAmountSource | null;
} {
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

  const allHaveSnapshot = lines.every((l) => l.budgetUnitCostSnapshot != null);
  if (!allHaveSnapshot) {
    return { estimatedAmount: null, estimatedAmountCurrency: null, estimatedAmountSource: null };
  }

  let total = "0";
  for (const line of lines) {
    const lineTotal = multiplyDecimal(line.quantity, line.budgetUnitCostSnapshot!);
    total = addDecimal(total, lineTotal);
  }

  return {
    estimatedAmount: serializeMoneyDecimal(total),
    estimatedAmountCurrency: "ARS",
    estimatedAmountSource: "budget",
  };
}
