export type PurchaseReceiptListItem = {
  id: string;
  purchaseOrderCode: string;
  purchaseOrderId?: string;
  supplierName: string;
  receiptDate: Date;
  status: string;
  receivedByName: string | null;
  lineCount?: number;
  quantitySummary?: string;
};
