/**
 * Markers for supplier-invoice drafts auto-created from a purchase order / receipt.
 * Kept Prisma-free so client components can import via
 * `@bloqer/services/supplier-invoice-from-po-markers`.
 */

/** Marker stored in internalNotes for idempotent draft creation from OC/receipt. */
export function buildAutoFromPoInternalNotes(
  purchaseOrderId: string,
  purchaseReceiptId?: string | null,
): string {
  const base = `bloqer:auto-from-po:${purchaseOrderId}`;
  return purchaseReceiptId ? `${base}:receipt:${purchaseReceiptId}` : base;
}

const AUTO_FROM_PO_RE = /^bloqer:auto-from-po:([0-9a-f-]{36})(?:$|:)/i;

/**
 * Parse the OC id from auto-from-PO internalNotes (`bloqer:auto-from-po:{uuid}`).
 * Used to prevent unlinking OC drafts (Pendientes / 3-way coverage).
 */
export function parseAutoFromPoPurchaseOrderId(
  internalNotes: string | null | undefined,
): string | null {
  if (!internalNotes?.trim()) return null;
  const m = AUTO_FROM_PO_RE.exec(internalNotes.trim());
  return m?.[1] ?? null;
}

/** True when notes look like the auto draft created from an OC (legacy orphans). */
export function looksLikeGeneratedFromPurchaseOrderNotes(
  notes: string | null | undefined,
): boolean {
  if (!notes?.trim()) return false;
  return /^Generada desde (OC-|recepción vinculada a )/i.test(notes.trim());
}

/** UI + service: draft must keep payee and Contra OC. */
export function isSupplierInvoiceLockedFromPurchaseOrder(
  internalNotes: string | null | undefined,
  notes: string | null | undefined,
): boolean {
  return (
    Boolean(parseAutoFromPoPurchaseOrderId(internalNotes)) ||
    looksLikeGeneratedFromPurchaseOrderNotes(notes)
  );
}
