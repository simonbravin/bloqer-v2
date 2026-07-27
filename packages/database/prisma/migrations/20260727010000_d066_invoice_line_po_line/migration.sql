-- D-066: SupplierInvoiceLine → PurchaseOrderLine for cost exposure / traceability
ALTER TABLE "supplier_invoice_lines" ADD COLUMN "purchaseOrderLineId" TEXT;

CREATE INDEX "supplier_invoice_lines_purchaseOrderLineId_idx" ON "supplier_invoice_lines"("purchaseOrderLineId");

ALTER TABLE "supplier_invoice_lines" ADD CONSTRAINT "supplier_invoice_lines_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "purchase_order_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
