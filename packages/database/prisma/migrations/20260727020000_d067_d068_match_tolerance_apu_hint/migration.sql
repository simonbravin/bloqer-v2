-- D-067: over-receipt + invoice 3-way match tolerances on company procurement settings
-- D-068: optional costAnalysisLineId on PO / PR lines (APU hint; imputation remains WBS)

ALTER TABLE "company_procurement_settings" ADD COLUMN "overReceiptTolerancePct" DECIMAL(8,4) NOT NULL DEFAULT 0;
ALTER TABLE "company_procurement_settings" ADD COLUMN "invoiceMatchTolerancePct" DECIMAL(8,4) NOT NULL DEFAULT 0;

ALTER TABLE "purchase_request_lines" ADD COLUMN "costAnalysisLineId" TEXT;
CREATE INDEX "purchase_request_lines_costAnalysisLineId_idx" ON "purchase_request_lines"("costAnalysisLineId");
ALTER TABLE "purchase_request_lines" ADD CONSTRAINT "purchase_request_lines_costAnalysisLineId_fkey" FOREIGN KEY ("costAnalysisLineId") REFERENCES "cost_analysis_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "purchase_order_lines" ADD COLUMN "costAnalysisLineId" TEXT;
CREATE INDEX "purchase_order_lines_costAnalysisLineId_idx" ON "purchase_order_lines"("costAnalysisLineId");
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_costAnalysisLineId_fkey" FOREIGN KEY ("costAnalysisLineId") REFERENCES "cost_analysis_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
