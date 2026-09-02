import { Prisma, prisma } from "@bloqer/database";
import { resolveInvoiceLineMoney } from "../finance/invoice-line-money";

type TxClient = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

/** Canonical line math [D-053]/[D-093]/[D-086]: discount on rounded subtotal, then IVA; header = sum. */
export function calcLine(
  quantity: Prisma.Decimal,
  unitPrice: Prisma.Decimal,
  taxRate: Prisma.Decimal,
  discountPct: Prisma.Decimal = new Prisma.Decimal(0),
  pricesIncludeTax?: boolean,
) {
  const { unitPriceNet, lineSubtotal, lineTax, lineTotal } = resolveInvoiceLineMoney({
    quantity,
    unitPrice,
    taxRate,
    discountPct,
    pricesIncludeTax,
  });
  return { unitPriceNet, lineSubtotal, lineTax, lineTotal };
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
