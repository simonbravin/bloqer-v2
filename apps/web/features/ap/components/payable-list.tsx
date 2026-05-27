import { PayableTable } from "./payable-table";

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

interface Props {
  payables: PayableListItem[];
  hrefPrefix: string;
  supplierInvoiceHrefPrefix?: string;
}

/** @deprecated Use PayableTable or PayableListSection */
export function PayableList({ payables, hrefPrefix, supplierInvoiceHrefPrefix }: Props) {
  return (
    <PayableTable
      payables={payables}
      hrefPrefix={hrefPrefix}
      supplierInvoiceHrefPrefix={supplierInvoiceHrefPrefix}
    />
  );
}
