import { addDecimal, divideDecimal, multiplyDecimal, roundMoney, roundRatePct } from "@bloqer/utils";

type DecimalValue = string | number;

export type BudgetSaleSettings = {
  overheadPct: DecimalValue;
  financialCostPct: DecimalValue;
  financialDaysAvg: number;
  profitPct: DecimalValue;
  taxPct: DecimalValue;
};

export type BudgetSaleItem = { unitCostDirect: DecimalValue; quantity: DecimalValue };

/** All monetary amounts are business-scale strings; this module is browser-safe. */
export type SaleBreakdown = {
  directCost: string;
  overhead: string;
  subtotal1: string;
  financialCost: string;
  financialEffectivePct: string;
  subtotal2: string;
  profit: string;
  subtotal3: string;
  tax: string;
  totalSale: string;
};

function percentage(amount: DecimalValue, pct: DecimalValue): string {
  return divideDecimal(multiplyDecimal(amount, pct), "100");
}

function difference(a: DecimalValue, b: DecimalValue): string {
  return roundMoney(addDecimal(a, multiplyDecimal(b, "-1")));
}

/** D-053 / D-073: apply and round the commercial cascade per unit of a leaf item. */
export function computeBudgetItemUnitSaleBreakdown(
  unitCostDirect: DecimalValue,
  settings: BudgetSaleSettings,
): SaleBreakdown {
  const directCost = roundMoney(unitCostDirect);
  const overhead = percentage(directCost, settings.overheadPct);
  const subtotal1 = roundMoney(addDecimal(directCost, overhead));
  const financialEffectivePct = settings.financialDaysAvg > 0
    ? divideDecimal(multiplyDecimal(settings.financialCostPct, settings.financialDaysAvg), "365", 4)
    : roundRatePct(settings.financialCostPct);
  // Divide once at the money boundary. Rounding the effective % first would
  // change the financial cost of large items or exact half-cent cases.
  const financialCost = settings.financialDaysAvg > 0
    ? divideDecimal(multiplyDecimal(multiplyDecimal(subtotal1, settings.financialCostPct), settings.financialDaysAvg), "36500")
    : percentage(subtotal1, settings.financialCostPct);
  const subtotal2 = roundMoney(addDecimal(subtotal1, financialCost));
  const profit = percentage(subtotal2, settings.profitPct);
  const subtotal3 = roundMoney(addDecimal(subtotal2, profit));
  const tax = percentage(subtotal3, settings.taxPct);
  return {
    directCost, overhead, subtotal1, financialCost, financialEffectivePct,
    subtotal2, profit, subtotal3, tax,
    totalSale: roundMoney(addDecimal(subtotal3, tax)),
  };
}

/**
 * Project the unit cascade onto each item's quantity, then sum the item stages.
 * The displayed increments are differences of those rounded stages, keeping
 * the breakdown additive even with fractional quantities. The final amount is
 * exactly sum(roundMoney(unitSalePrice * quantity)), as stored by the service.
 */
export function computeBudgetSaleBreakdown(
  items: readonly BudgetSaleItem[],
  settings: BudgetSaleSettings,
): SaleBreakdown {
  let directCost = "0.00";
  let subtotal1 = "0.00";
  let subtotal2 = "0.00";
  let subtotal3 = "0.00";
  let totalSale = "0.00";
  const financialEffectivePct = computeBudgetItemUnitSaleBreakdown("0", settings).financialEffectivePct;
  for (const item of items) {
    const unit = computeBudgetItemUnitSaleBreakdown(item.unitCostDirect, settings);
    directCost = addDecimal(directCost, roundMoney(multiplyDecimal(unit.directCost, item.quantity)));
    subtotal1 = addDecimal(subtotal1, roundMoney(multiplyDecimal(unit.subtotal1, item.quantity)));
    subtotal2 = addDecimal(subtotal2, roundMoney(multiplyDecimal(unit.subtotal2, item.quantity)));
    subtotal3 = addDecimal(subtotal3, roundMoney(multiplyDecimal(unit.subtotal3, item.quantity)));
    totalSale = addDecimal(totalSale, roundMoney(multiplyDecimal(unit.totalSale, item.quantity)));
  }
  return {
    directCost: roundMoney(directCost),
    overhead: difference(subtotal1, directCost),
    subtotal1: roundMoney(subtotal1),
    financialCost: difference(subtotal2, subtotal1),
    financialEffectivePct,
    subtotal2: roundMoney(subtotal2),
    profit: difference(subtotal3, subtotal2),
    subtotal3: roundMoney(subtotal3),
    tax: difference(totalSale, subtotal3),
    totalSale: roundMoney(totalSale),
  };
}
