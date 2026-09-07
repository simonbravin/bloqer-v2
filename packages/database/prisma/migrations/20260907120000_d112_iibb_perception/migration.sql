-- D-112: document-level Percepción IIBB on purchase/sales headers
-- Base = net subtotal (before IVA). Existing rows stay at 0% / 0 amount.

ALTER TABLE "sales_invoices"
  ADD COLUMN IF NOT EXISTS "iibbPerceptionRate" DECIMAL(8,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "iibbPerceptionAmount" DECIMAL(18,4) NOT NULL DEFAULT 0;

ALTER TABLE "supplier_invoices"
  ADD COLUMN IF NOT EXISTS "iibbPerceptionRate" DECIMAL(8,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "iibbPerceptionAmount" DECIMAL(18,4) NOT NULL DEFAULT 0;

ALTER TABLE "procurement_quotes"
  ADD COLUMN IF NOT EXISTS "iibbPerceptionRate" DECIMAL(8,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "iibbPerceptionAmount" DECIMAL(18,4) NOT NULL DEFAULT 0;

ALTER TABLE "purchase_orders"
  ADD COLUMN IF NOT EXISTS "iibbPerceptionRate" DECIMAL(8,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "iibbPerceptionAmount" DECIMAL(18,4) NOT NULL DEFAULT 0;
