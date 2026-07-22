export type SupplierInvoiceListItem = {
  id: string;
  code: string;
  supplierName: string;
  issueDate: Date;
  dueDate: Date;
  totalAmount: string;
  currency: string;
  status: string;
  payableId?: string | null;
  payableStatus?: string | null;
};
