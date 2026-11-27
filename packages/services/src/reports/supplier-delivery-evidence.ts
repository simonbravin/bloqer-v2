export type SupplierDeliverySourceOrder = {
  id: string;
  number: number;
  supplierContactId: string;
  supplierName: string;
  status: string;
  issueDate: Date;
  expectedDeliveryDate: Date | null;
  receiptDates: Date[];
};

export type SupplierDeliveryEvidence = {
  supplierContactId: string;
  supplierName: string;
  orderCount: number;
  receivedCount: number;
  partiallyReceivedCount: number;
  confirmedCount: number;
  withExpectedDateCount: number;
  withReceiptCount: number;
  orders: {
    id: string;
    number: number;
    status: string;
    issueDate: string;
    expectedDeliveryDate: string | null;
    lastReceiptDate: string | null;
  }[];
};

/** Current recorded facts for the already-authorized, currency/date-filtered PO cohort.
 * A last receipt is not a completion date. Do not derive OTIF or supplier fault from it.
 */
export function buildSupplierDeliveryEvidence(orders: SupplierDeliverySourceOrder[]): SupplierDeliveryEvidence[] {
  const suppliers = new Map<string, SupplierDeliveryEvidence>();
  const seen = new Set<string>();
  for (const order of orders) {
    if (!["CONFIRMED", "PARTIALLY_RECEIVED", "RECEIVED"].includes(order.status) || seen.has(order.id)) continue;
    seen.add(order.id);
    let supplier = suppliers.get(order.supplierContactId);
    if (!supplier) {
      supplier = { supplierContactId: order.supplierContactId, supplierName: order.supplierName,
        orderCount: 0, receivedCount: 0, partiallyReceivedCount: 0, confirmedCount: 0,
        withExpectedDateCount: 0, withReceiptCount: 0, orders: [] };
      suppliers.set(order.supplierContactId, supplier);
    }
    supplier.orderCount++;
    if (order.status === "RECEIVED") supplier.receivedCount++;
    if (order.status === "PARTIALLY_RECEIVED") supplier.partiallyReceivedCount++;
    if (order.status === "CONFIRMED") supplier.confirmedCount++;
    if (order.expectedDeliveryDate) supplier.withExpectedDateCount++;
    if (order.receiptDates.length > 0) supplier.withReceiptCount++;
    const lastReceipt = order.receiptDates.reduce<Date | null>((latest, date) => !latest || date > latest ? date : latest, null);
    supplier.orders.push({ id: order.id, number: order.number, status: order.status,
      issueDate: order.issueDate.toISOString().slice(0, 10),
      expectedDeliveryDate: order.expectedDeliveryDate?.toISOString().slice(0, 10) ?? null,
      lastReceiptDate: lastReceipt?.toISOString().slice(0, 10) ?? null });
  }
  for (const supplier of suppliers.values()) {
    supplier.orders.sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.number - a.number);
  }
  return [...suppliers.values()].sort((a, b) => a.supplierName.localeCompare(b.supplierName, "es"));
}
