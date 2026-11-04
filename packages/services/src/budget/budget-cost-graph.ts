import { prisma } from "@bloqer/database";

import { ServiceError } from "../types";

/** Check both FK directions before reading monetary values from a budget graph. */
export async function assertBudgetCostGraph(budgetId: string): Promise<void> {
  const items = await prisma.costItem.findMany({
    where: { OR: [{ budgetId }, { wbsNode: { budgetId } }, { analysisLines: { some: { budgetId } } }] },
    select: { budgetId: true, wbsNode: { select: { budgetId: true } }, analysisLines: { select: { budgetId: true } } },
  });
  for (const item of items) {
    if (item.budgetId !== item.wbsNode.budgetId || item.analysisLines.some((line) => line.budgetId !== item.budgetId)) {
      throw new ServiceError("CONFLICT", "Hay documentos con vínculos de empresa, obra o presupuesto inconsistentes. Revisá su trazabilidad antes de consultar los costos.");
    }
  }
}
