import {
  formatSalesInvoiceCode,
  formatSupplierInvoiceCode,
} from "../notifications/notification-copy";

const UUID_FRAGMENT =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

const LEGACY_PAYMENT_DESC_RE = new RegExp(
  `^Pago factura proveedor ${UUID_FRAGMENT}$`,
  "i",
);
const LEGACY_COLLECTION_DESC_RE = new RegExp(
  `^Cobranza factura ${UUID_FRAGMENT}$`,
  "i",
);

/** Prefer human invoice codes over legacy UUID descriptions baked into older rows. */
export function displayMovementDescription(
  description: string,
  sourceType: string,
  documentRef: string | null,
): string {
  if (!documentRef) return description;
  const trimmed = description.trim();
  if (sourceType === "PAYMENT" && LEGACY_PAYMENT_DESC_RE.test(trimmed)) {
    return `Pago factura proveedor ${documentRef}`;
  }
  if (sourceType === "COLLECTION" && LEGACY_COLLECTION_DESC_RE.test(trimmed)) {
    return `Cobranza factura ${documentRef}`;
  }
  return description;
}

export function supplierInvoiceDocumentRef(number: number | null | undefined): string | null {
  return number != null ? formatSupplierInvoiceCode(number) : null;
}

export function salesInvoiceDocumentRef(number: number | null | undefined): string | null {
  return number != null ? formatSalesInvoiceCode(number) : null;
}
