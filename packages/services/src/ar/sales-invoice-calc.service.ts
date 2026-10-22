import { Prisma, prisma } from "@bloqer/database";
import { resolveInvoiceLineMoney } from "../finance/invoice-line-money";
import { headerTotalsWithIibbPerception } from "../finance/document-header-tax";

type TxClient = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/** Lock before reading header/lines so an edit cannot change an issued document or its AR amount. */
export async function lockSalesInvoiceRow(
  tx: TxClient,
  invoiceId: string,
  tenantId: string,
): Promise<void> {
  await tx.$queryRaw`
    SELECT id FROM sales_invoices
    WHERE id = ${invoiceId} AND "tenantId" = ${tenantId}
    FOR UPDATE
  `;
}

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

export async function recalcInvoiceTotals(tx: TxClient, invoiceId: string): Promise<void> {
  const [lines, invHeader] = await Promise.all([
    tx.salesInvoiceLine.findMany({
      where: { invoiceId },
      select: { lineSubtotal: true, lineTax: true },
    }),
    tx.salesInvoice.findUniqueOrThrow({
      where: { id: invoiceId },
      select: { iibbPerceptionRate: true },
    }),
  ]);
  const { subtotal, taxAmount, iibbPerceptionAmount, totalAmount } = headerTotalsWithIibbPerception(
    {
      lineSubtotals: lines.map((l) => l.lineSubtotal),
      lineTaxes: lines.map((l) => l.lineTax),
      iibbPerceptionRate: invHeader.iibbPerceptionRate,
    },
  );
  await tx.salesInvoice.update({
    where: { id: invoiceId },
    data: { subtotal, taxAmount, iibbPerceptionAmount, totalAmount },
  });
}
