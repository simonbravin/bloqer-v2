-- D-099: job-cost nature (CostCategory) on procurement / AP lines for EDT partida × cost type.

ALTER TABLE "purchase_request_lines" ADD COLUMN IF NOT EXISTS "costType" "CostCategory";
ALTER TABLE "purchase_order_lines" ADD COLUMN IF NOT EXISTS "costType" "CostCategory";
ALTER TABLE "supplier_invoice_lines" ADD COLUMN IF NOT EXISTS "costType" "CostCategory";

-- Backfill from APU hint when present.
UPDATE "purchase_request_lines" prl
SET "costType" = cal.category
FROM "cost_analysis_lines" cal
WHERE prl."costAnalysisLineId" = cal.id
  AND prl."costType" IS NULL;

UPDATE "purchase_order_lines" pol
SET "costType" = cal.category
FROM "cost_analysis_lines" cal
WHERE pol."costAnalysisLineId" = cal.id
  AND pol."costType" IS NULL;

-- Remaining PO/PR lines → MATERIAL (typical purchase).
UPDATE "purchase_request_lines" SET "costType" = 'MATERIAL' WHERE "costType" IS NULL;
UPDATE "purchase_order_lines" SET "costType" = 'MATERIAL' WHERE "costType" IS NULL;

-- Invoice lines: inherit from linked PO line when possible.
UPDATE "supplier_invoice_lines" sil
SET "costType" = pol."costType"
FROM "purchase_order_lines" pol
WHERE sil."purchaseOrderLineId" = pol.id
  AND sil."costType" IS NULL
  AND pol."costType" IS NOT NULL;

UPDATE "supplier_invoice_lines" SET "costType" = 'MATERIAL' WHERE "costType" IS NULL;

CREATE INDEX IF NOT EXISTS "purchase_request_lines_costType_idx" ON "purchase_request_lines"("costType");
CREATE INDEX IF NOT EXISTS "purchase_order_lines_costType_idx" ON "purchase_order_lines"("costType");
CREATE INDEX IF NOT EXISTS "supplier_invoice_lines_costType_idx" ON "supplier_invoice_lines"("costType");
