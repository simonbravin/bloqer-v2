export type FinancialTraceEntityType =
  | "SupplierInvoice"
  | "Payable"
  | "Payment"
  | "AccountMovement"
  | "SalesInvoice"
  | "Receivable"
  | "Collection";

export type FinancialTraceLink = {
  entityType: FinancialTraceEntityType;
  entityId: string;
  href: string;
  code?: string | null;
};

export type RegisterTransactionKind =
  | "AP_EXPENSE"
  | "TREASURY_INFLOW"
  | "PAYMENT"
  | "AR_SALE"
  | "AR_INCOME";

export type RegisterTransactionResult = {
  kind: RegisterTransactionKind;
  primaryEntityId: string;
  primaryEntityType: FinancialTraceEntityType;
  href: string;
  traceChain: FinancialTraceLink[];
};
