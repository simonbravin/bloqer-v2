import { Prisma, prisma } from "@bloqer/database";
import { toMoneyDecimal } from "../finance/money-decimal";

type TxClient = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

/** Canonical line math [D-053]: round each money component to 2 dp, then sum at header. */
export function calcLine(quantity: Prisma.Decimal, unitPrice: Prisma.Decimal, taxRate: Prisma.Decimal) {
  const lineSubtotal = toMoneyDecimal(quantity.times(unitPrice));
  const lineTax = toMoneyDecimal(lineSubtotal.times(taxRate).dividedBy(100));
  const lineTotal = toMoneyDecimal(lineSubtotal.plus(lineTax));
  return { lineSubtotal, lineTax, lineTotal };
}

export async function recalcPurchaseOrderTotals(tx: TxClient, purchaseOrderId: string): Promise<void> {
  const lines = await tx.purchaseOrderLine.findMany({
    where: { purchaseOrderId },
    select: { lineSubtotal: true, lineTax: true, lineTotal: true },
  });
  const zero        = new Prisma.Decimal(0);
  const subtotal    = lines.reduce((s, l) => s.plus(l.lineSubtotal), zero);
  const taxAmount   = lines.reduce((s, l) => s.plus(l.lineTax), zero);
  const totalAmount = lines.reduce((s, l) => s.plus(l.lineTotal), zero);
  await tx.purchaseOrder.update({
    where: { id: purchaseOrderId },
    data: { subtotal, taxAmount, totalAmount },
  });
}
