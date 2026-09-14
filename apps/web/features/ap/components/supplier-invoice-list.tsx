export type SupplierInvoiceListItem = {
  id: string;
  code: string;
  supplierName: string;
  issueDate: Date;
  dueDate: Date;
  totalAmount: string;
  currency: string;
  status: string;
  documentKind?: string | null;
  payableId?: string | null;
  payableStatus?: string | null;
  invoiceLetter?: string | null;
  classCode?: string | null;
  classLabel?: string | null;
  classFamily?: string | null;
};
