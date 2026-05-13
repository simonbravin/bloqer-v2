-- Phase 16B: company-level AP (nullable projectId) + optional treasury movement project dimension.
-- Risk: existing rows keep non-null projectId; no data backfill required.

-- supplier_invoices: allow corporate invoices without project
ALTER TABLE "supplier_invoices" DROP CONSTRAINT "supplier_invoices_projectId_fkey";
ALTER TABLE "supplier_invoices" ALTER COLUMN "projectId" DROP NOT NULL;
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- payables
ALTER TABLE "payables" DROP CONSTRAINT "payables_projectId_fkey";
ALTER TABLE "payables" ALTER COLUMN "projectId" DROP NOT NULL;
ALTER TABLE "payables" ADD CONSTRAINT "payables_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- payments
ALTER TABLE "payments" DROP CONSTRAINT "payments_projectId_fkey";
ALTER TABLE "payments" ALTER COLUMN "projectId" DROP NOT NULL;
ALTER TABLE "payments" ADD CONSTRAINT "payments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- account_movements: optional analytic project (manual/reporting; not duplicated from PAYMENT/COLLECTION in this phase)
ALTER TABLE "account_movements" ADD COLUMN "projectId" TEXT;
CREATE INDEX "account_movements_tenantId_projectId_idx" ON "account_movements"("tenantId", "projectId");
ALTER TABLE "account_movements" ADD CONSTRAINT "account_movements_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
