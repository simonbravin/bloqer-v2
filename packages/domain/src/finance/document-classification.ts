/**
 * Derived financial document classification — [D-102].
 * Pure helpers: no I/O, no persisted enums. Labels are computed from existing FKs.
 */

export type FinancialDocumentClassCode =
  | "SALE_CERT"
  | "SALE_PROJECT"
  | "INCOME_CORPORATE"
  | "INCOME_CASH"
  | "PURCHASE_COMMITTED"
  | "SUBCONTRACT"
  | "DIRECT_PROJECT"
  | "OVERHEAD"
  | "COLLECTION"
  | "PAYMENT"
  | "TRANSFER";

/** UI family for badge coloring (one color per family, not per code). */
export type FinancialDocumentClassFamily =
  | "sale"
  | "income"
  | "purchase"
  | "direct"
  | "overhead"
  | "cash";

export type FinancialDocumentClass = {
  classCode: FinancialDocumentClassCode;
  classLabel: string;
  family: FinancialDocumentClassFamily;
};

export const FINANCIAL_DOCUMENT_CLASS_LABEL_ES: Record<
  FinancialDocumentClassCode,
  string
> = {
  SALE_CERT: "Venta — certificación",
  SALE_PROJECT: "Venta de obra",
  INCOME_CORPORATE: "Ingreso corporativo",
  INCOME_CASH: "Ingreso solo caja",
  PURCHASE_COMMITTED: "Compra comprometida",
  SUBCONTRACT: "Subcontrato",
  DIRECT_PROJECT: "Costo directo de obra",
  OVERHEAD: "Gasto general",
  COLLECTION: "Cobranza",
  PAYMENT: "Pago",
  TRANSFER: "Transferencia",
};

export const FINANCIAL_DOCUMENT_CLASS_FAMILY: Record<
  FinancialDocumentClassCode,
  FinancialDocumentClassFamily
> = {
  SALE_CERT: "sale",
  SALE_PROJECT: "sale",
  INCOME_CORPORATE: "income",
  INCOME_CASH: "income",
  PURCHASE_COMMITTED: "purchase",
  SUBCONTRACT: "purchase",
  DIRECT_PROJECT: "direct",
  OVERHEAD: "overhead",
  COLLECTION: "cash",
  PAYMENT: "cash",
  TRANSFER: "cash",
};

export const FINANCIAL_DOCUMENT_CLASS_CODES: FinancialDocumentClassCode[] = [
  "SALE_CERT",
  "SALE_PROJECT",
  "INCOME_CORPORATE",
  "INCOME_CASH",
  "PURCHASE_COMMITTED",
  "SUBCONTRACT",
  "DIRECT_PROJECT",
  "OVERHEAD",
  "COLLECTION",
  "PAYMENT",
  "TRANSFER",
];

function buildClass(code: FinancialDocumentClassCode): FinancialDocumentClass {
  return {
    classCode: code,
    classLabel: FINANCIAL_DOCUMENT_CLASS_LABEL_ES[code],
    family: FINANCIAL_DOCUMENT_CLASS_FAMILY[code],
  };
}

export type ClassifySalesInvoiceInput = {
  projectId: string | null | undefined;
  certificationId?: string | null | undefined;
};

/**
 * Classify a sales invoice / AR header.
 * Advance / quick-sale has no persisted signal without schema — falls back to SALE_PROJECT.
 */
export function classifySalesInvoice(
  input: ClassifySalesInvoiceInput,
): FinancialDocumentClass {
  if (!input.projectId) {
    return buildClass("INCOME_CORPORATE");
  }
  if (input.certificationId) {
    return buildClass("SALE_CERT");
  }
  return buildClass("SALE_PROJECT");
}

export type ClassifySupplierInvoiceInput = {
  projectId: string | null | undefined;
  purchaseOrderId?: string | null | undefined;
  /** True when any line has purchaseOrderLineId ([D-066]). */
  hasPoLineLink?: boolean | null | undefined;
  subcontractCertificationId?: string | null | undefined;
};

/**
 * Classify a supplier invoice / AP header.
 * Precedence: SUBCONTRACT > PURCHASE_COMMITTED > DIRECT_PROJECT | OVERHEAD.
 */
export function classifySupplierInvoice(
  input: ClassifySupplierInvoiceInput,
): FinancialDocumentClass {
  if (input.subcontractCertificationId) {
    return buildClass("SUBCONTRACT");
  }
  const committed = Boolean(input.purchaseOrderId) || Boolean(input.hasPoLineLink);
  if (committed) {
    return buildClass("PURCHASE_COMMITTED");
  }
  if (!input.projectId) {
    return buildClass("OVERHEAD");
  }
  return buildClass("DIRECT_PROJECT");
}

export type ClassifyAccountMovementInput = {
  type: string;
  sourceType: string;
};

/**
 * Classify a treasury AccountMovement.
 * Payment/Collection classes come from sourceType, not from the linked invoice.
 */
export function classifyAccountMovement(
  input: ClassifyAccountMovementInput,
): FinancialDocumentClass {
  const source = input.sourceType;
  const type = input.type;

  if (source === "COLLECTION") {
    return buildClass("COLLECTION");
  }
  if (source === "PAYMENT") {
    return buildClass("PAYMENT");
  }
  if (
    source === "INTERNAL_TRANSFER" ||
    type === "TRANSFER_IN" ||
    type === "TRANSFER_OUT"
  ) {
    return buildClass("TRANSFER");
  }
  // Corporate treasury inflow: INFLOW + MANUAL_ADJUSTMENT (or opening balance credit).
  if (type === "INFLOW") {
    return buildClass("INCOME_CASH");
  }
  // Manual OUTFLOW without Payment source → gasto de caja (G&A family).
  if (type === "OUTFLOW") {
    return buildClass("OVERHEAD");
  }
  // ADJUSTMENT (reserved / rare): not a bank transfer — treat as overhead-family cash.
  if (type === "ADJUSTMENT") {
    return buildClass("OVERHEAD");
  }
  return buildClass("TRANSFER");
}

export function isFinancialDocumentClassCode(
  value: string | null | undefined,
): value is FinancialDocumentClassCode {
  return (
    typeof value === "string" &&
    (FINANCIAL_DOCUMENT_CLASS_CODES as string[]).includes(value)
  );
}

export function formatFinancialDocumentClassLabel(
  code: string | null | undefined,
): string | null {
  if (!isFinancialDocumentClassCode(code)) return null;
  return FINANCIAL_DOCUMENT_CLASS_LABEL_ES[code];
}

/** Codes valid as `?class=` filters on sales invoice lists. */
export const SALES_INVOICE_CLASS_FILTER_CODES: FinancialDocumentClassCode[] = [
  "SALE_CERT",
  "SALE_PROJECT",
  "INCOME_CORPORATE",
];

/** Codes valid as `?class=` filters on supplier invoice lists. */
export const SUPPLIER_INVOICE_CLASS_FILTER_CODES: FinancialDocumentClassCode[] = [
  "PURCHASE_COMMITTED",
  "SUBCONTRACT",
  "DIRECT_PROJECT",
  "OVERHEAD",
];

/** Codes valid as `?class=` filters on treasury / transacciones movement lists. */
export const MOVEMENT_CLASS_FILTER_CODES: FinancialDocumentClassCode[] = [
  "INCOME_CASH",
  "COLLECTION",
  "PAYMENT",
  "TRANSFER",
  "OVERHEAD",
];
