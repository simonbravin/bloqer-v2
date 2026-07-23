import { Prisma } from "@bloqer/database";

export type PoLineForInvoiceDraft = {
  id: string;
  description: string;
  unitPrice: string;
  taxRate: string;
  orderQuantity: string;
  receivedQuantity: string;
  lineTotal: string;
  wbsNodeId: string | null;
};

export type InvoiceDraftLineInput = {
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  wbsNodeId?: string | null;
};

const ZERO = new Prisma.Decimal(0);

/** Format quantity for supplier invoice lines (avoids stripping trailing zeros from integers). */
export function formatInvoiceLineQuantity(qty: Prisma.Decimal): string {
  if (qty.lessThanOrEqualTo(0)) return "0";
  let s = qty.toFixed(4);
  if (s.includes(".")) {
    s = s.replace(/0+$/, "").replace(/\.$/, "");
  }
  return s;
}

/** Marker stored in internalNotes for idempotent draft creation from OC/receipt. */
export function buildAutoFromPoInternalNotes(
  purchaseOrderId: string,
  purchaseReceiptId?: string | null,
): string {
  const base = `bloqer:auto-from-po:${purchaseOrderId}`;
  return purchaseReceiptId ? `${base}:receipt:${purchaseReceiptId}` : base;
}

/** Received value for a PO line (proportional to lineTotal). */
export function poLineReceivedAmount(line: PoLineForInvoiceDraft): Prisma.Decimal {
  const orderQty = new Prisma.Decimal(line.orderQuantity);
  const receivedQty = new Prisma.Decimal(line.receivedQuantity);
  const lineTotal = new Prisma.Decimal(line.lineTotal);
  if (orderQty.lessThanOrEqualTo(0) || receivedQty.lessThanOrEqualTo(0)) return ZERO;
  return lineTotal.mul(receivedQty).div(orderQty);
}

export function sumPoLinesReceivedAmount(lines: PoLineForInvoiceDraft[]): Prisma.Decimal {
  return lines.reduce((acc, line) => acc.add(poLineReceivedAmount(line)), ZERO);
}

export function computePendingToInvoiceAmount(
  receivedAmount: Prisma.Decimal,
  invoicedAmount: Prisma.Decimal,
): Prisma.Decimal {
  const pending = receivedAmount.sub(invoicedAmount);
  return pending.greaterThan(0) ? pending : ZERO;
}

/**
 * Build supplier invoice line inputs from PO lines.
 * When receiptQuantities is set, only those PO lines with qty > 0 are included.
 */
export function buildInvoiceDraftLinesFromPo(
  lines: PoLineForInvoiceDraft[],
  opts: {
    basis: "received" | "remaining";
    receiptQuantities?: ReadonlyMap<string, string>;
    receivedAmount: Prisma.Decimal;
    invoicedAmount: Prisma.Decimal;
  },
): InvoiceDraftLineInput[] {
  const remainingFactor =
    opts.basis === "remaining" && opts.receivedAmount.greaterThan(0)
      ? computePendingToInvoiceAmount(opts.receivedAmount, opts.invoicedAmount).div(
          opts.receivedAmount,
        )
      : new Prisma.Decimal(1);

  const result: InvoiceDraftLineInput[] = [];

  for (const line of lines) {
    let qty: Prisma.Decimal;
    if (opts.receiptQuantities) {
      const receiptQty = opts.receiptQuantities.get(line.id);
      if (!receiptQty) continue;
      qty = new Prisma.Decimal(receiptQty);
    } else {
      qty = new Prisma.Decimal(line.receivedQuantity);
    }

    if (opts.basis === "remaining") {
      qty = qty.mul(remainingFactor);
    }

    if (qty.lessThanOrEqualTo(0)) continue;

    result.push({
      description: line.description,
      quantity: formatInvoiceLineQuantity(qty),
      unitPrice: line.unitPrice,
      taxRate: line.taxRate,
      wbsNodeId: line.wbsNodeId,
    });
  }

  return result;
}
