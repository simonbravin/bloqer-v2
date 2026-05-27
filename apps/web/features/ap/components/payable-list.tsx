export type PayableListItem = {
  id: string;
  supplierName: string;
  dueDate: Date;
  status: string;
  originalAmount: string;
  paidAmount: string;
  balanceDue: string;
  currency: string;
  supplierInvoiceId?: string;
  supplierInvoiceCode?: string | null;
};
