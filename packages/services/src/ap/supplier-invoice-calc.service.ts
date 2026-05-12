import { Prisma, prisma } from "@bloqer/database";

type TxClient = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

export function calcLine(quantity: Prisma.Decimal, unitPrice: Prisma.Decimal, taxRate: Prisma.Decimal) {
  const lineSubtotal = quantity.times(unitPrice);
  const lineTax      = lineSubtotal.times(taxRate).dividedBy(100);
  const lineTotal    = lineSubtotal.plus(lineTax);
  return { lineSubtotal, lineTax, lineTotal };
}

export async function recalcSupplierInvoiceTotals(tx: TxClient, invoiceId: string): Promise<void> {
  const lines = await tx.supplierInvoiceLine.findMany({
    where: { invoiceId },
    select: { lineSubtotal: true, lineTax: true, lineTotal: true },
  });
  const zero        = new Prisma.Decimal(0);
  const subtotal    = lines.reduce((s, l) => s.plus(l.lineSubtotal), zero);
  const taxAmount   = lines.reduce((s, l) => s.plus(l.lineTax), zero);
  const totalAmount = lines.reduce((s, l) => s.plus(l.lineTotal), zero);
  await tx.supplierInvoice.update({
    where: { id: invoiceId },
    data: { subtotal, taxAmount, totalAmount },
  });
}
