-- Oleada B: auto-confirm on approve ([D-107]) + auto-draft AP on receipt ([D-108]).
ALTER TABLE "company_procurement_settings"
  ADD COLUMN IF NOT EXISTS "autoConfirmOnApprove" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "autoDraftApInvoiceOnReceipt" BOOLEAN NOT NULL DEFAULT false;
