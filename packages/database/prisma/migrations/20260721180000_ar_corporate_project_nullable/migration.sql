-- D-051 / Q-030 option 1: company-level AR (nullable projectId) + external voucher ref on sales invoices.
-- Mirrors Phase 16B AP (supplier_invoices / payables / payments). Existing rows keep non-null projectId.

-- sales_invoices: allow corporate invoices without project
ALTER TABLE "sales_invoices" DROP CONSTRAINT "sales_invoices_projectId_fkey";
ALTER TABLE "sales_invoices" ALTER COLUMN "projectId" DROP NOT NULL;
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- External official voucher reference (bridge to ARCA / off-system billing)
ALTER TABLE "sales_invoices" ADD COLUMN "externalInvoiceRef" TEXT;

-- receivables
ALTER TABLE "receivables" DROP CONSTRAINT "receivables_projectId_fkey";
ALTER TABLE "receivables" ALTER COLUMN "projectId" DROP NOT NULL;
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- collections
ALTER TABLE "collections" DROP CONSTRAINT "collections_projectId_fkey";
ALTER TABLE "collections" ALTER COLUMN "projectId" DROP NOT NULL;
ALTER TABLE "collections" ADD CONSTRAINT "collections_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
