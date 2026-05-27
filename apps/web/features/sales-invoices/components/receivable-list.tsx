import type { ReceivableStatus } from "@bloqer/database";

export type ReceivableListItem = {
  id: string;
  projectId: string;
  salesInvoiceId: string;
  dueDate: Date;
  status: ReceivableStatus;
  originalAmount: string;
  paidAmount: string;
  balanceDue: string;
  currency: string;
  clientName: string;
};
