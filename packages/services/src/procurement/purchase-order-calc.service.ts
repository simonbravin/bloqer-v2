import { Prisma, prisma } from "@bloqer/database";
import { resolveInvoiceLineMoney } from "../finance/invoice-line-money";
import { headerTotalsWithIibbPerception } from "../finance/document-header-tax";

type TxClient = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

/** Canonical line math [D-053]/[D-093]/[D-086]: discount on rounded subtotal, then IVA; header = sum + IIBB ([D-112]). */
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
  const [lines, poHeader] = await Promise.all([
    tx.purchaseOrderLine.findMany({
      where: { purchaseOrderId },
      select: { lineSubtotal: true, lineTax: true },
    }),
    tx.purchaseOrder.findUniqueOrThrow({
      where: { id: purchaseOrderId },
      select: { iibbPerceptionRate: true },
    }),
  ]);
  const { subtotal, taxAmount, iibbPerceptionAmount, totalAmount } = headerTotalsWithIibbPerception({
    lineSubtotals: lines.map((l) => l.lineSubtotal),
    lineTaxes: lines.map((l) => l.lineTax),
    iibbPerceptionRate: poHeader.iibbPerceptionRate,
  });
  await tx.purchaseOrder.update({
    where: { id: purchaseOrderId },
    data: { subtotal, taxAmount, iibbPerceptionAmount, totalAmount },
  });
}
