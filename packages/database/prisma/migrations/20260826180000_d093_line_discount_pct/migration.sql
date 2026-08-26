-- D-093: percentage discount on document lines (before IVA)

ALTER TABLE "purchase_order_lines" ADD COLUMN "discountPct" DECIMAL(8,4) NOT NULL DEFAULT 0;
ALTER TABLE "supplier_invoice_lines" ADD COLUMN "discountPct" DECIMAL(8,4) NOT NULL DEFAULT 0;
ALTER TABLE "sales_invoice_lines" ADD COLUMN "discountPct" DECIMAL(8,4) NOT NULL DEFAULT 0;
ALTER TABLE "procurement_quote_lines" ADD COLUMN "discountPct" DECIMAL(8,4) NOT NULL DEFAULT 0;
