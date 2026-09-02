-- D-110: optional costAnalysisLineId on supplier invoice lines (APU hint; imputation remains WBS)

ALTER TABLE "supplier_invoice_lines" ADD COLUMN "costAnalysisLineId" TEXT;
CREATE INDEX "supplier_invoice_lines_costAnalysisLineId_idx" ON "supplier_invoice_lines"("costAnalysisLineId");
ALTER TABLE "supplier_invoice_lines" ADD CONSTRAINT "supplier_invoice_lines_costAnalysisLineId_fkey" FOREIGN KEY ("costAnalysisLineId") REFERENCES "cost_analysis_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
