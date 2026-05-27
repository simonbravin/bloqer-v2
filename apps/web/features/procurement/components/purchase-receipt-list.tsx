/** @deprecated Use PurchaseReceiptTable or PurchaseReceiptListSection */
export { PurchaseReceiptTable as PurchaseReceiptList } from "./purchase-receipt-table";

export type PurchaseReceiptListItem = {
  id: string;
  purchaseOrderCode: string;
  supplierName: string;
  receiptDate: Date;
  status: string;
};
