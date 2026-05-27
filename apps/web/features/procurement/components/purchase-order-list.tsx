/** @deprecated Use PurchaseOrderTable or PurchaseOrderListSection */
export { PurchaseOrderTable as PurchaseOrderList } from "./purchase-order-table";

export type PurchaseOrderListItem = {
  id: string;
  code: string;
  supplierName: string;
  issueDate: Date;
  expectedDeliveryDate: Date | null;
  totalAmount: string;
  currency: string;
  status: string;
};
