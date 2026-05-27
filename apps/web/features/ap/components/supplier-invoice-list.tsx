/** @deprecated Use SupplierInvoiceTable or SupplierInvoiceListSection */
export { SupplierInvoiceTable as SupplierInvoiceList } from "./supplier-invoice-table";

export type SupplierInvoiceListItem = {
  id: string;
  code: string;
  supplierName: string;
  issueDate: Date;
  dueDate: Date;
  totalAmount: string;
  currency: string;
  status: string;
};
