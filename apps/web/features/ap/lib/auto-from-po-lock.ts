/**
 * Client-safe detection of supplier invoices auto-created from a PO/receipt.
 * Keep in sync with `@bloqer/services` markers (`supplier-invoice-from-po-markers.ts`).
 */

const AUTO_FROM_PO_RE = /^bloqer:auto-from-po:([0-9a-f-]{36})(?:$|:)/i;

export function isSupplierInvoiceLockedFromPurchaseOrder(
  internalNotes: string | null | undefined,
  notes: string | null | undefined,
): boolean {
  if (internalNotes?.trim() && AUTO_FROM_PO_RE.test(internalNotes.trim())) {
    return true;
  }
  if (notes?.trim() && /^Generada desde (OC-|recepción vinculada a )/i.test(notes.trim())) {
    return true;
  }
  return false;
}
