// Internal recalculation helpers — not exported from services/index.ts
import { Prisma, prisma } from "@bloqer/database";
import type { BudgetSettings } from "@bloqer/database";

type TxClient = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

const D = Prisma.Decimal;
const HUNDRED = new D(100);

export async function _recalcCostItemTotals(
  tx: TxClient,
  costItemId: string,
  settings: BudgetSettings,
): Promise<void> {
  const [lines, costItem] = await Promise.all([
    tx.costAnalysisLine.findMany({ where: { costItemId } }),
    tx.costItem.findUniqueOrThrow({ where: { id: costItemId } }),
  ]);

  const unitCostDirect = lines.reduce(
    (sum, l) => sum.plus(l.totalCost),
    new D(0),
  );

  const overhead = unitCostDirect.times(settings.overheadPct).dividedBy(HUNDRED);
  const subtotal1 = unitCostDirect.plus(overhead);
  const finCost = subtotal1.times(settings.financialCostPct).dividedBy(HUNDRED);

  const subtotal = subtotal1.plus(finCost);
  const profit = subtotal.times(settings.profitPct).dividedBy(HUNDRED);
  const tax = subtotal.plus(profit).times(settings.taxPct).dividedBy(HUNDRED);
  const unitSalePrice = subtotal.plus(profit).plus(tax);

  const totalCostDirect = unitCostDirect.times(costItem.quantity);
  const totalSalePrice = unitSalePrice.times(costItem.quantity);

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
  const totalCost = items.reduce((s, i) => s.plus(i.totalCostDirect), new D(0));
  const totalSalePrice = items.reduce((s, i) => s.plus(i.totalSalePrice), new D(0));
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
