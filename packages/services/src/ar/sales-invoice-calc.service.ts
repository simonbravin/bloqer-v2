import { Prisma, prisma } from "@bloqer/database";

type TxClient = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

export function calcLine(quantity: Prisma.Decimal, unitPrice: Prisma.Decimal, taxRate: Prisma.Decimal) {
  const lineSubtotal = quantity.times(unitPrice);
  const lineTax      = lineSubtotal.times(taxRate).dividedBy(100);
  const lineTotal    = lineSubtotal.plus(lineTax);
  return { lineSubtotal, lineTax, lineTotal };
}

export async function recalcInvoiceTotals(tx: TxClient, invoiceId: string): Promise<void> {
  const lines = await tx.salesInvoiceLine.findMany({
    where: { invoiceId },
    select: { lineSubtotal: true, lineTax: true, lineTotal: true },
  });
  const zero = new Prisma.Decimal(0);
  const subtotal    = lines.reduce((s, l) => s.plus(l.lineSubtotal), zero);
  const taxAmount   = lines.reduce((s, l) => s.plus(l.lineTax), zero);
  const totalAmount = lines.reduce((s, l) => s.plus(l.lineTotal), zero);
  await tx.salesInvoice.update({
    where: { id: invoiceId },
    data: { subtotal, taxAmount, totalAmount },
  });
}
