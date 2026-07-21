import type { SalesInvoiceStatus } from "@bloqer/database";

export type SalesInvoiceListItem = {
  id: string;
  projectId: string | null;
  code: string;
  issueDate: Date;
  dueDate: Date;
  status: SalesInvoiceStatus;
  totalAmount: string;
  currency: string;
  clientName: string;
};
