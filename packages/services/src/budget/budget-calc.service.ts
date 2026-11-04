// Internal recalculation helpers — not exported from services/index.ts
import { Prisma, prisma } from "@bloqer/database";
import type { BudgetSettings } from "@bloqer/database";
import { toMoneyDecimal } from "../finance/money-decimal";
import { computeBudgetItemUnitSaleBreakdown } from "./budget-sale-calc";
import { assertBudgetDecimalFits } from "./budget-decimal";

type TxClient = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

const D = Prisma.Decimal;
const HUNDRED = new D(100);
const DAYS_PER_YEAR = new D(365);

/**
 * Factor applied to (direct + overhead) for budget financial cost [D-073] / BUDGET_FORMULAS.
 * - `financialDaysAvg > 0`: annual rate × days/365
 * - `financialDaysAvg === 0`: flat % mark-up (legacy budgets that never set days)
 */
export function financialCostFactor(
  financialCostPct: Prisma.Decimal | number,
  financialDaysAvg: number,
): Prisma.Decimal {
  const rate = new D(financialCostPct).dividedBy(HUNDRED);
  if (financialDaysAvg > 0) {
    return rate.times(financialDaysAvg).dividedBy(DAYS_PER_YEAR);
  }
  return rate;
}

export async function _recalcCostItemTotals(
  tx: TxClient,
  costItemId: string,
  settings: BudgetSettings,
): Promise<void> {
  const [lines, costItem] = await Promise.all([
    tx.costAnalysisLine.findMany({ where: { costItemId } }),
    tx.costItem.findUniqueOrThrow({ where: { id: costItemId } }),
  ]);

  const unitCostDirect = assertBudgetDecimalFits(toMoneyDecimal(
    lines.reduce((sum, l) => sum.plus(l.totalCost), new D(0)),
  ), "Costo directo unitario");

  const sale = computeBudgetItemUnitSaleBreakdown(unitCostDirect.toString(), {
    overheadPct: settings.overheadPct.toString(),
    financialCostPct: settings.financialCostPct.toString(),
    financialDaysAvg: settings.financialDaysAvg,
    profitPct: settings.profitPct.toString(),
    taxPct: settings.taxPct.toString(),
  });
  const unitSalePrice = assertBudgetDecimalFits(sale.totalSale, "Precio de venta unitario");

  const totalCostDirect = assertBudgetDecimalFits(toMoneyDecimal(unitCostDirect.times(costItem.quantity)), "Costo directo de la partida");
  const totalSalePrice = assertBudgetDecimalFits(toMoneyDecimal(unitSalePrice.times(costItem.quantity)), "Venta de la partida");

  await tx.costItem.update({
    where: { id: costItemId },
    data: { unitCostDirect, unitSalePrice, totalCostDirect, totalSalePrice },
  });
}

export async function _recalcBudgetSummary(
  tx: TxClient,
  budgetId: string,
): Promise<void> {
  const items = await tx.costItem.findMany({ where: { budgetId } });
  const totalCost = assertBudgetDecimalFits(toMoneyDecimal(
    items.reduce((s, i) => s.plus(i.totalCostDirect), new D(0)),
  ), "Costo total del presupuesto");
  const totalSalePrice = assertBudgetDecimalFits(toMoneyDecimal(
    items.reduce((s, i) => s.plus(i.totalSalePrice), new D(0)),
  ), "Venta total del presupuesto");
  await tx.budget.update({ where: { id: budgetId }, data: { totalCost, totalSalePrice } });
}

export async function _recalcAllItems(
  tx: TxClient,
  budgetId: string,
): Promise<void> {
  const settings = await tx.budgetSettings.findUniqueOrThrow({ where: { budgetId } });
  const items = await tx.costItem.findMany({ where: { budgetId }, select: { id: true } });
  for (const item of items) {
    await _recalcCostItemTotals(tx, item.id, settings);
  }
  await _recalcBudgetSummary(tx, budgetId);
}
