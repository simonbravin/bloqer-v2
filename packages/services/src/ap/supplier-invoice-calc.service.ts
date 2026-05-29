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
  const inv = await tx.supplierInvoice.update({
    where: { id: invoiceId },
    data: { subtotal, taxAmount, totalAmount },
    select: { currency: true, totalAmount: true, fxRate: true, status: true },
  });

  if (inv.status === "DRAFT") {
    const { computeDocumentFxAmounts } = await import("../finance/fx-amount.service");
    try {
      const fx = computeDocumentFxAmounts(inv.currency, inv.totalAmount, inv.fxRate);
      await tx.supplierInvoice.update({
        where: { id: invoiceId },
        data: { fxRate: fx.fxRate, amountArs: fx.amountArs },
      });
    } catch {
      // Non-ARS draft without FX — amountArs stays until issue
    }
  }
}
