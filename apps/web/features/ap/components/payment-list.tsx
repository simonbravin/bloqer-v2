export type PaymentListItem = {
  id: string;
  paymentDate: Date;
  amount: string;
  currency: string;
  status: string;
  accountName: string;
  supplierInvoiceId: string;
};
