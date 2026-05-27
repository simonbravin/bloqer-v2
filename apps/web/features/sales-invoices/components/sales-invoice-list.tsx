import type { SalesInvoiceStatus } from "@bloqer/database";

/** @deprecated Use SalesInvoiceTable or SalesInvoiceListSection */
export { SalesInvoiceTable as SalesInvoiceList } from "./sales-invoice-table";

export type SalesInvoiceListItem = {
  id: string;
  projectId: string;
  code: string;
  issueDate: Date;
  dueDate: Date;
  status: SalesInvoiceStatus;
  totalAmount: string;
  currency: string;
  clientName: string;
};
