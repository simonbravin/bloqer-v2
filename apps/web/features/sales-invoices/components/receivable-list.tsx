import type { ReceivableStatus } from "@bloqer/database";
import { ReceivableTable } from "./receivable-table";

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

interface ReceivableListProps {
  receivables: ReceivableListItem[];
  projectId: string;
}

/** @deprecated Use ReceivableTable or ReceivableListSection */
export function ReceivableList({ receivables, projectId }: ReceivableListProps) {
  return <ReceivableTable receivables={receivables} projectId={projectId} />;
}
