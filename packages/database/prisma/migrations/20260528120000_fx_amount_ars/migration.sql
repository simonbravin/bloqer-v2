-- D-008: FX manual + amount_ars on financial documents (ADR-011)

ALTER TABLE "sales_invoices" ADD COLUMN "fxRate" DECIMAL(18,6) NOT NULL DEFAULT 1;
ALTER TABLE "sales_invoices" ADD COLUMN "amountArs" DECIMAL(18,4) NOT NULL DEFAULT 0;
UPDATE "sales_invoices" SET "amountArs" = "totalAmount", "fxRate" = 1 WHERE "currency" = 'ARS' OR "amountArs" = 0;

ALTER TABLE "supplier_invoices" ADD COLUMN "fxRate" DECIMAL(18,6) NOT NULL DEFAULT 1;
ALTER TABLE "supplier_invoices" ADD COLUMN "amountArs" DECIMAL(18,4) NOT NULL DEFAULT 0;
UPDATE "supplier_invoices" SET "amountArs" = "totalAmount", "fxRate" = 1 WHERE "currency" = 'ARS' OR "amountArs" = 0;

ALTER TABLE "collections" ADD COLUMN "fxRate" DECIMAL(18,6) NOT NULL DEFAULT 1;
ALTER TABLE "collections" ADD COLUMN "amountArs" DECIMAL(18,4) NOT NULL DEFAULT 0;
UPDATE "collections" SET "amountArs" = "amount", "fxRate" = 1 WHERE "currency" = 'ARS' OR "amountArs" = 0;

ALTER TABLE "payments" ADD COLUMN "fxRate" DECIMAL(18,6) NOT NULL DEFAULT 1;
ALTER TABLE "payments" ADD COLUMN "amountArs" DECIMAL(18,4) NOT NULL DEFAULT 0;
UPDATE "payments" SET "amountArs" = "amount", "fxRate" = 1 WHERE "currency" = 'ARS' OR "amountArs" = 0;
