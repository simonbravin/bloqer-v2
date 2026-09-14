-- [D-115] Fiscal document kinds (INVOICE / CREDIT_NOTE / DEBIT_NOTE) + credit applications.

-- ── Enums ────────────────────────────────────────────────────────────────────
CREATE TYPE "FiscalDocumentKind" AS ENUM ('INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE');
CREATE TYPE "CreditApplicationStatus" AS ENUM ('CONFIRMED', 'CANCELLED');

ALTER TYPE "JournalEntrySourceType" ADD VALUE IF NOT EXISTS 'SALES_CREDIT_NOTE';
ALTER TYPE "JournalEntrySourceType" ADD VALUE IF NOT EXISTS 'SALES_DEBIT_NOTE';
ALTER TYPE "JournalEntrySourceType" ADD VALUE IF NOT EXISTS 'SUPPLIER_CREDIT_NOTE';
ALTER TYPE "JournalEntrySourceType" ADD VALUE IF NOT EXISTS 'SUPPLIER_DEBIT_NOTE';

ALTER TYPE "AccountingMappingEventType" ADD VALUE IF NOT EXISTS 'SALES_CREDIT_NOTE_ISSUED';
ALTER TYPE "AccountingMappingEventType" ADD VALUE IF NOT EXISTS 'SALES_DEBIT_NOTE_ISSUED';
ALTER TYPE "AccountingMappingEventType" ADD VALUE IF NOT EXISTS 'SUPPLIER_CREDIT_NOTE_ISSUED';
ALTER TYPE "AccountingMappingEventType" ADD VALUE IF NOT EXISTS 'SUPPLIER_DEBIT_NOTE_ISSUED';

-- ── Sales invoices ───────────────────────────────────────────────────────────
ALTER TABLE "sales_invoices"
  ADD COLUMN "documentKind" "FiscalDocumentKind" NOT NULL DEFAULT 'INVOICE',
  ADD COLUMN "referencedSalesInvoiceId" TEXT;

DROP INDEX IF EXISTS "sales_invoices_tenantId_companyId_number_key";
CREATE UNIQUE INDEX "sales_invoices_tenantId_companyId_documentKind_number_key"
  ON "sales_invoices"("tenantId", "companyId", "documentKind", "number");

CREATE INDEX "sales_invoices_tenantId_documentKind_idx"
  ON "sales_invoices"("tenantId", "documentKind");
CREATE INDEX "sales_invoices_referencedSalesInvoiceId_idx"
  ON "sales_invoices"("referencedSalesInvoiceId");

ALTER TABLE "sales_invoices"
  ADD CONSTRAINT "sales_invoices_referencedSalesInvoiceId_fkey"
  FOREIGN KEY ("referencedSalesInvoiceId") REFERENCES "sales_invoices"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Only INVOICE (not NC/ND) counts toward one-active-per-certification ([BR-NC-006]).
DROP INDEX IF EXISTS "sales_invoices_one_active_per_certification_key";
CREATE UNIQUE INDEX "sales_invoices_one_active_per_certification_key"
  ON "sales_invoices" ("certificationId")
  WHERE "certificationId" IS NOT NULL
    AND "status" <> 'CANCELLED'
    AND "documentKind" = 'INVOICE';

-- ── Supplier invoices ────────────────────────────────────────────────────────
ALTER TABLE "supplier_invoices"
  ADD COLUMN "documentKind" "FiscalDocumentKind" NOT NULL DEFAULT 'INVOICE',
  ADD COLUMN "referencedSupplierInvoiceId" TEXT;

DROP INDEX IF EXISTS "supplier_invoices_tenantId_companyId_number_key";
CREATE UNIQUE INDEX "supplier_invoices_tenantId_companyId_documentKind_number_key"
  ON "supplier_invoices"("tenantId", "companyId", "documentKind", "number");

CREATE INDEX "supplier_invoices_tenantId_documentKind_idx"
  ON "supplier_invoices"("tenantId", "documentKind");
CREATE INDEX "supplier_invoices_referencedSupplierInvoiceId_idx"
  ON "supplier_invoices"("referencedSupplierInvoiceId");

ALTER TABLE "supplier_invoices"
  ADD CONSTRAINT "supplier_invoices_referencedSupplierInvoiceId_fkey"
  FOREIGN KEY ("referencedSupplierInvoiceId") REFERENCES "supplier_invoices"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Obligation creditedAmount ────────────────────────────────────────────────
ALTER TABLE "receivables"
  ADD COLUMN "creditedAmount" DECIMAL(18,4) NOT NULL DEFAULT 0;

ALTER TABLE "payables"
  ADD COLUMN "creditedAmount" DECIMAL(18,4) NOT NULL DEFAULT 0;

-- ── Credit applications ──────────────────────────────────────────────────────
CREATE TABLE "receivable_credit_applications" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "receivableId" TEXT NOT NULL,
  "creditNoteSalesInvoiceId" TEXT NOT NULL,
  "amount" DECIMAL(18,4) NOT NULL,
  "status" "CreditApplicationStatus" NOT NULL DEFAULT 'CONFIRMED',
  "createdBy" TEXT,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "receivable_credit_applications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "receivable_credit_applications_creditNoteSalesInvoiceId_key"
  ON "receivable_credit_applications"("creditNoteSalesInvoiceId");
CREATE INDEX "receivable_credit_applications_tenantId_receivableId_idx"
  ON "receivable_credit_applications"("tenantId", "receivableId");
CREATE INDEX "receivable_credit_applications_tenantId_status_idx"
  ON "receivable_credit_applications"("tenantId", "status");

ALTER TABLE "receivable_credit_applications"
  ADD CONSTRAINT "receivable_credit_applications_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receivable_credit_applications"
  ADD CONSTRAINT "receivable_credit_applications_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receivable_credit_applications"
  ADD CONSTRAINT "receivable_credit_applications_receivableId_fkey"
  FOREIGN KEY ("receivableId") REFERENCES "receivables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receivable_credit_applications"
  ADD CONSTRAINT "receivable_credit_applications_creditNoteSalesInvoiceId_fkey"
  FOREIGN KEY ("creditNoteSalesInvoiceId") REFERENCES "sales_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "payable_credit_applications" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "payableId" TEXT NOT NULL,
  "creditNoteSupplierInvoiceId" TEXT NOT NULL,
  "amount" DECIMAL(18,4) NOT NULL,
  "status" "CreditApplicationStatus" NOT NULL DEFAULT 'CONFIRMED',
  "createdBy" TEXT,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payable_credit_applications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payable_credit_applications_creditNoteSupplierInvoiceId_key"
  ON "payable_credit_applications"("creditNoteSupplierInvoiceId");
CREATE INDEX "payable_credit_applications_tenantId_payableId_idx"
  ON "payable_credit_applications"("tenantId", "payableId");
CREATE INDEX "payable_credit_applications_tenantId_status_idx"
  ON "payable_credit_applications"("tenantId", "status");

ALTER TABLE "payable_credit_applications"
  ADD CONSTRAINT "payable_credit_applications_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payable_credit_applications"
  ADD CONSTRAINT "payable_credit_applications_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payable_credit_applications"
  ADD CONSTRAINT "payable_credit_applications_payableId_fkey"
  FOREIGN KEY ("payableId") REFERENCES "payables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payable_credit_applications"
  ADD CONSTRAINT "payable_credit_applications_creditNoteSupplierInvoiceId_fkey"
  FOREIGN KEY ("creditNoteSupplierInvoiceId") REFERENCES "supplier_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
