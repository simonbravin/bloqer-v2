import type { SettingsDefaults } from "../components/budget-settings-form";

export type SaleBreakdown = {
  directCost: number;
  overhead: number;
  subtotal1: number;
  financialCost: number;
  subtotal2: number;
  profit: number;
  subtotal3: number;
  tax: number;
  totalSale: number;
};

/** Réplica cliente de budget-calc.service.ts a nivel presupuesto. */
export function computeBudgetSaleBreakdown(
  directCost: number,
  settings: SettingsDefaults,
): SaleBreakdown {
  const overhead = directCost * (settings.overheadPct / 100);
  const subtotal1 = directCost + overhead;
  const financialCost = subtotal1 * (settings.financialCostPct / 100);
  const subtotal2 = subtotal1 + financialCost;
  const profit = subtotal2 * (settings.profitPct / 100);
  const subtotal3 = subtotal2 + profit;
  const tax = subtotal3 * (settings.taxPct / 100);
  const totalSale = subtotal3 + tax;

  return {
    directCost,
    overhead,
    subtotal1,
    financialCost,
    subtotal2,
    profit,
    subtotal3,
    tax,
    totalSale,
  };
}
