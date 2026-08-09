import type { SettingsDefaults } from "../components/budget-settings-form";

export type SaleBreakdown = {
  directCost: number;
  overhead: number;
  subtotal1: number;
  financialCost: number;
  /** Effective GF factor as % of subtotal1 (after days proration when applicable). */
  financialEffectivePct: number;
  subtotal2: number;
  profit: number;
  subtotal3: number;
  tax: number;
  totalSale: number;
};

/**
 * Réplica cliente de budget-calc.service.ts a nivel presupuesto [D-073].
 * - days > 0: CF = subtotal1 × (rate%/100) × (days/365)
 * - days = 0: CF = subtotal1 × (rate%/100) flat (legacy)
 */
export function computeBudgetSaleBreakdown(
  directCost: number,
  settings: SettingsDefaults,
): SaleBreakdown {
  const overhead = directCost * (settings.overheadPct / 100);
  const subtotal1 = directCost + overhead;
  const rate = settings.financialCostPct / 100;
  const days = settings.financialDaysAvg ?? 0;
  const finFactor = days > 0 ? rate * (days / 365) : rate;
  const financialCost = subtotal1 * finFactor;
  const financialEffectivePct = finFactor * 100;
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
    financialEffectivePct,
    subtotal2,
    profit,
    subtotal3,
    tax,
    totalSale,
  };
}
