import { PaymentTable } from "./payment-table";

export type PaymentListItem = {
  id: string;
  paymentDate: Date;
  amount: string;
  currency: string;
  status: string;
  accountName: string;
  supplierInvoiceId: string;
};

interface Props {
  payments: PaymentListItem[];
  hrefPrefix: string;
}

/** @deprecated Use PaymentTable or PaymentListSection */
export function PaymentList({ payments, hrefPrefix }: Props) {
  return <PaymentTable payments={payments} hrefPrefix={hrefPrefix} />;
}
