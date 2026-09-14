/**
 * Fiscal document kind labels ([D-115]).
 * Distinct from derived financial Clase ([D-102]).
 */

export type FiscalDocumentKindCode = "INVOICE" | "CREDIT_NOTE" | "DEBIT_NOTE";

export const FISCAL_DOCUMENT_KIND_LABELS: Record<FiscalDocumentKindCode, string> = {
  INVOICE: "Factura",
  CREDIT_NOTE: "Nota de crédito",
  DEBIT_NOTE: "Nota de débito",
};

export function fiscalDocumentKindLabel(kind: string | null | undefined): string {
  if (kind === "CREDIT_NOTE" || kind === "DEBIT_NOTE" || kind === "INVOICE") {
    return FISCAL_DOCUMENT_KIND_LABELS[kind];
  }
  return FISCAL_DOCUMENT_KIND_LABELS.INVOICE;
}

export function isFiscalDocumentKind(value: unknown): value is FiscalDocumentKindCode {
  return value === "INVOICE" || value === "CREDIT_NOTE" || value === "DEBIT_NOTE";
}
