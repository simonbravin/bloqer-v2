-- [D-084] Condición frente al IVA + letra de comprobante A/B/C/E

CREATE TYPE "IvaCondition" AS ENUM (
  'RESPONSIBLE_INSCRIPTO',
  'MONOTAX',
  'EXEMPT',
  'FINAL_CONSUMER',
  'NOT_CATEGORIZED',
  'FOREIGN'
);

CREATE TYPE "InvoiceLetter" AS ENUM ('A', 'B', 'C', 'E');

ALTER TABLE "companies" ADD COLUMN "ivaCondition" "IvaCondition";

ALTER TABLE "contacts" ADD COLUMN "ivaCondition" "IvaCondition";

ALTER TABLE "sales_invoices" ADD COLUMN "invoiceLetter" "InvoiceLetter";

ALTER TABLE "supplier_invoices" ADD COLUMN "invoiceLetter" "InvoiceLetter";

CREATE INDEX "sales_invoices_tenantId_invoiceLetter_idx" ON "sales_invoices"("tenantId", "invoiceLetter");

CREATE INDEX "supplier_invoices_tenantId_invoiceLetter_idx" ON "supplier_invoices"("tenantId", "invoiceLetter");
