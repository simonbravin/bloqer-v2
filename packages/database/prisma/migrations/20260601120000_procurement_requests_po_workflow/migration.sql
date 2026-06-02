-- Purchase request + procurement quote + PO approval workflow (D-044 area)

-- New enums
CREATE TYPE "PurchaseRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'QUOTE_SELECTED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "ProcurementQuoteStatus" AS ENUM ('DRAFT', 'RECEIVED', 'SELECTED', 'REJECTED', 'SUPERSEDED');
CREATE TYPE "PurchaseRequestLineType" AS ENUM ('MATERIAL', 'SERVICE', 'OTHER');
CREATE TYPE "PurchaseOrderVarianceTier" AS ENUM ('NONE', 'NOTE_REQUIRED', 'EXTRA_APPROVAL', 'NO_BUDGET_BASELINE', 'UNIT_MISMATCH');

-- PurchaseOrderStatus: ISSUED -> CONFIRMED, add SUBMITTED/APPROVED
CREATE TYPE "PurchaseOrderStatus_new" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'CONFIRMED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED'
);

ALTER TABLE "purchase_orders" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "purchase_orders"
  ALTER COLUMN "status" TYPE "PurchaseOrderStatus_new"
  USING (
    CASE "status"::text
      WHEN 'ISSUED' THEN 'CONFIRMED'::"PurchaseOrderStatus_new"
      ELSE "status"::text::"PurchaseOrderStatus_new"
    END
  );

ALTER TABLE "purchase_orders" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

DROP TYPE "PurchaseOrderStatus";
ALTER TYPE "PurchaseOrderStatus_new" RENAME TO "PurchaseOrderStatus";

-- Linked entity types for document attachments
ALTER TYPE "LinkedEntityType" ADD VALUE IF NOT EXISTS 'PURCHASE_REQUEST';
ALTER TYPE "LinkedEntityType" ADD VALUE IF NOT EXISTS 'PROCUREMENT_QUOTE';

-- Company procurement settings
CREATE TABLE "company_procurement_settings" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "poApprovalThresholdArs" DECIMAL(18,4),
  "purchaseRequestRequiredAboveArs" DECIMAL(18,4),
  "minQuotesRequired" INTEGER NOT NULL DEFAULT 2,
  "maxQuotesAllowed" INTEGER NOT NULL DEFAULT 3,
  "quoteRequiredCategories" JSONB,
  "allowDirectPo" BOOLEAN NOT NULL DEFAULT true,
  "allowSelfApproval" BOOLEAN NOT NULL DEFAULT true,
  "allowEmergencyDirectPo" BOOLEAN NOT NULL DEFAULT false,
  "varianceSoftAlertPct" DECIMAL(8,4) NOT NULL DEFAULT 10,
  "varianceNoteRequiredPct" DECIMAL(8,4) NOT NULL DEFAULT 25,
  "varianceExtraApprovalPct" DECIMAL(8,4) NOT NULL DEFAULT 25,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "company_procurement_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "company_procurement_settings_companyId_key" ON "company_procurement_settings"("companyId");

ALTER TABLE "company_procurement_settings"
  ADD CONSTRAINT "company_procurement_settings_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Purchase requests
CREATE TABLE "purchase_requests" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "number" INTEGER NOT NULL,
  "requestedByUserId" TEXT,
  "neededByDate" DATE,
  "status" "PurchaseRequestStatus" NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "emergencyDirectPoReason" TEXT,
  "submittedAt" TIMESTAMP(3),
  "createdBy" TEXT,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "purchase_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "purchase_requests_tenantId_companyId_number_key"
  ON "purchase_requests"("tenantId", "companyId", "number");
CREATE INDEX "purchase_requests_tenantId_projectId_idx" ON "purchase_requests"("tenantId", "projectId");
CREATE INDEX "purchase_requests_tenantId_status_idx" ON "purchase_requests"("tenantId", "status");

ALTER TABLE "purchase_requests"
  ADD CONSTRAINT "purchase_requests_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_requests"
  ADD CONSTRAINT "purchase_requests_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_requests"
  ADD CONSTRAINT "purchase_requests_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "purchase_request_lines" (
  "id" TEXT NOT NULL,
  "purchaseRequestId" TEXT NOT NULL,
  "wbsNodeId" TEXT,
  "productId" TEXT,
  "lineType" "PurchaseRequestLineType" NOT NULL DEFAULT 'MATERIAL',
  "description" TEXT NOT NULL,
  "unit" TEXT NOT NULL DEFAULT '',
  "quantity" DECIMAL(18,4) NOT NULL,
  "budgetUnitCostSnapshot" DECIMAL(18,4),
  "budgetQuantitySnapshot" DECIMAL(18,4),
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "purchase_request_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "purchase_request_lines_purchaseRequestId_idx" ON "purchase_request_lines"("purchaseRequestId");
CREATE INDEX "purchase_request_lines_wbsNodeId_idx" ON "purchase_request_lines"("wbsNodeId");

ALTER TABLE "purchase_request_lines"
  ADD CONSTRAINT "purchase_request_lines_purchaseRequestId_fkey"
  FOREIGN KEY ("purchaseRequestId") REFERENCES "purchase_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_request_lines"
  ADD CONSTRAINT "purchase_request_lines_wbsNodeId_fkey"
  FOREIGN KEY ("wbsNodeId") REFERENCES "wbs_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_request_lines"
  ADD CONSTRAINT "purchase_request_lines_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "procurement_quotes" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "purchaseRequestId" TEXT NOT NULL,
  "supplierContactId" TEXT NOT NULL,
  "status" "ProcurementQuoteStatus" NOT NULL DEFAULT 'DRAFT',
  "currency" TEXT NOT NULL DEFAULT 'ARS',
  "fxRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
  "totalAmountArs" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "subtotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "taxAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "totalAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "validUntil" DATE,
  "notes" TEXT,
  "receivedAt" TIMESTAMP(3),
  "createdBy" TEXT,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "procurement_quotes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "procurement_quotes_tenantId_purchaseRequestId_idx"
  ON "procurement_quotes"("tenantId", "purchaseRequestId");
CREATE INDEX "procurement_quotes_purchaseRequestId_supplierContactId_idx"
  ON "procurement_quotes"("purchaseRequestId", "supplierContactId");

ALTER TABLE "procurement_quotes"
  ADD CONSTRAINT "procurement_quotes_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "procurement_quotes"
  ADD CONSTRAINT "procurement_quotes_purchaseRequestId_fkey"
  FOREIGN KEY ("purchaseRequestId") REFERENCES "purchase_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "procurement_quotes"
  ADD CONSTRAINT "procurement_quotes_supplierContactId_fkey"
  FOREIGN KEY ("supplierContactId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "procurement_quote_lines" (
  "id" TEXT NOT NULL,
  "procurementQuoteId" TEXT NOT NULL,
  "purchaseRequestLineId" TEXT NOT NULL,
  "unitPrice" DECIMAL(18,4) NOT NULL,
  "taxRate" DECIMAL(8,4) NOT NULL DEFAULT 0,
  "lineSubtotal" DECIMAL(18,4) NOT NULL,
  "lineTax" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "lineTotal" DECIMAL(18,4) NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "procurement_quote_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "procurement_quote_lines_procurementQuoteId_idx" ON "procurement_quote_lines"("procurementQuoteId");

ALTER TABLE "procurement_quote_lines"
  ADD CONSTRAINT "procurement_quote_lines_procurementQuoteId_fkey"
  FOREIGN KEY ("procurementQuoteId") REFERENCES "procurement_quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "procurement_quote_lines"
  ADD CONSTRAINT "procurement_quote_lines_purchaseRequestLineId_fkey"
  FOREIGN KEY ("purchaseRequestLineId") REFERENCES "purchase_request_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Extend purchase_orders
ALTER TABLE "purchase_orders" ADD COLUMN "purchaseRequestId" TEXT;
ALTER TABLE "purchase_orders" ADD COLUMN "selectedProcurementQuoteId" TEXT;
ALTER TABLE "purchase_orders" ADD COLUMN "originRequestedByUserId" TEXT;
ALTER TABLE "purchase_orders" ADD COLUMN "fxRate" DECIMAL(18,6) NOT NULL DEFAULT 1;
ALTER TABLE "purchase_orders" ADD COLUMN "totalAmountArs" DECIMAL(18,4) NOT NULL DEFAULT 0;
ALTER TABLE "purchase_orders" ADD COLUMN "approvedByUserId" TEXT;
ALTER TABLE "purchase_orders" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "purchase_orders" ADD COLUMN "confirmedByUserId" TEXT;
ALTER TABLE "purchase_orders" ADD COLUMN "confirmedAt" TIMESTAMP(3);

UPDATE "purchase_orders"
SET "totalAmountArs" = "totalAmount", "fxRate" = 1
WHERE "currency" = 'ARS';

CREATE INDEX "purchase_orders_purchaseRequestId_idx" ON "purchase_orders"("purchaseRequestId");

ALTER TABLE "purchase_orders"
  ADD CONSTRAINT "purchase_orders_purchaseRequestId_fkey"
  FOREIGN KEY ("purchaseRequestId") REFERENCES "purchase_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_orders"
  ADD CONSTRAINT "purchase_orders_selectedProcurementQuoteId_fkey"
  FOREIGN KEY ("selectedProcurementQuoteId") REFERENCES "procurement_quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Extend purchase_order_lines
ALTER TABLE "purchase_order_lines" ADD COLUMN "budgetUnitCostSnapshot" DECIMAL(18,4);
ALTER TABLE "purchase_order_lines" ADD COLUMN "variancePct" DECIMAL(18,4);
ALTER TABLE "purchase_order_lines" ADD COLUMN "varianceTier" "PurchaseOrderVarianceTier" NOT NULL DEFAULT 'NONE';
ALTER TABLE "purchase_order_lines" ADD COLUMN "varianceJustification" TEXT;
ALTER TABLE "purchase_order_lines" ADD COLUMN "varianceUnitMismatch" BOOLEAN NOT NULL DEFAULT false;
