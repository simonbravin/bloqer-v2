import { Prisma, prisma } from "@bloqer/database";
import { resolveInvoiceLineMoney } from "../finance/invoice-line-money";
import { headerTotalsWithIibbPerception } from "../finance/document-header-tax";

type TxClient = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

/** Canonical line math [D-053]/[D-093]: discount on rounded subtotal, then IVA; header = sum + IIBB ([D-112]). */
export function calcLine(
  quantity: Prisma.Decimal,
  unitPrice: Prisma.Decimal,
  taxRate: Prisma.Decimal,
  discountPct: Prisma.Decimal = new Prisma.Decimal(0),
) {
  const { lineSubtotal, lineTax, lineTotal } = resolveInvoiceLineMoney({
    quantity,
    unitPrice,
    taxRate,
    discountPct,
  });
  return { lineSubtotal, lineTax, lineTotal };
}

export async function recalcSupplierInvoiceTotals(tx: TxClient, invoiceId: string): Promise<void> {
  const [lines, invHeader] = await Promise.all([
    tx.supplierInvoiceLine.findMany({
      where: { invoiceId },
      select: { lineSubtotal: true, lineTax: true },
    }),
    tx.supplierInvoice.findUniqueOrThrow({
      where: { id: invoiceId },
      select: { iibbPerceptionRate: true },
    }),
  ]);
  const { subtotal, taxAmount, iibbPerceptionAmount, totalAmount } = headerTotalsWithIibbPerception({
    lineSubtotals: lines.map((l) => l.lineSubtotal),
    lineTaxes: lines.map((l) => l.lineTax),
    iibbPerceptionRate: invHeader.iibbPerceptionRate,
  });
  const inv = await tx.supplierInvoice.update({
    where: { id: invoiceId },
    data: { subtotal, taxAmount, iibbPerceptionAmount, totalAmount },
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
