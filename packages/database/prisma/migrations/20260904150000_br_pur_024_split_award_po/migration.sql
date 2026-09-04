-- BR-PUR-024 / D-044: multi-OC award by whole PurchaseRequestLine

-- 1) Columns
ALTER TABLE "purchase_request_lines" ADD COLUMN IF NOT EXISTS "awardedPurchaseOrderId" TEXT;

ALTER TABLE "purchase_order_lines" ADD COLUMN IF NOT EXISTS "purchaseRequestLineId" TEXT;
ALTER TABLE "purchase_order_lines" ADD COLUMN IF NOT EXISTS "procurementQuoteLineId" TEXT;
ALTER TABLE "purchase_order_lines" ADD COLUMN IF NOT EXISTS "isActiveAward" BOOLEAN NOT NULL DEFAULT true;

-- 2) Dedupe procurement_quote_lines before unique (keep lowest sortOrder, then id)
DELETE FROM "procurement_quote_lines" a
USING "procurement_quote_lines" b
WHERE a."procurementQuoteId" = b."procurementQuoteId"
  AND a."purchaseRequestLineId" = b."purchaseRequestLineId"
  AND (
    a."sortOrder" > b."sortOrder"
    OR (a."sortOrder" = b."sortOrder" AND a."id" > b."id")
  );

-- 3) Backfill PO lines from selected quote by sortOrder (legacy whole-quote awards)
WITH matched AS (
  SELECT
    pol."id" AS po_line_id,
    pql."purchaseRequestLineId" AS pr_line_id,
    pql."id" AS quote_line_id,
    po."id" AS po_id,
    po."status" AS po_status
  FROM "purchase_order_lines" pol
  INNER JOIN "purchase_orders" po ON po."id" = pol."purchaseOrderId"
  INNER JOIN "procurement_quote_lines" pql
    ON pql."procurementQuoteId" = po."selectedProcurementQuoteId"
   AND pql."sortOrder" = pol."sortOrder"
  WHERE po."selectedProcurementQuoteId" IS NOT NULL
    AND po."purchaseRequestId" IS NOT NULL
    AND pol."purchaseRequestLineId" IS NULL
)
UPDATE "purchase_order_lines" pol
SET
  "purchaseRequestLineId" = matched.pr_line_id,
  "procurementQuoteLineId" = matched.quote_line_id,
  "isActiveAward" = (matched.po_status <> 'CANCELLED')
FROM matched
WHERE pol."id" = matched.po_line_id;

-- 4) Coverage cache on PR lines for active (non-cancelled) awards
UPDATE "purchase_request_lines" prl
SET "awardedPurchaseOrderId" = pol."purchaseOrderId"
FROM "purchase_order_lines" pol
INNER JOIN "purchase_orders" po ON po."id" = pol."purchaseOrderId"
WHERE pol."purchaseRequestLineId" = prl."id"
  AND pol."isActiveAward" = true
  AND po."status" <> 'CANCELLED'
  AND prl."awardedPurchaseOrderId" IS NULL;

-- 5) Unique quote line per (quote, PR line)
CREATE UNIQUE INDEX IF NOT EXISTS "procurement_quote_lines_procurementQuoteId_purchaseRequestLineId_key"
  ON "procurement_quote_lines"("procurementQuoteId", "purchaseRequestLineId");

-- 6) Partial unique: one active award per PR line
CREATE UNIQUE INDEX IF NOT EXISTS "purchase_order_lines_active_pr_line_award_uidx"
  ON "purchase_order_lines"("purchaseRequestLineId")
  WHERE "purchaseRequestLineId" IS NOT NULL AND "isActiveAward" = true;

-- 7) Indexes
CREATE INDEX IF NOT EXISTS "purchase_request_lines_awardedPurchaseOrderId_idx"
  ON "purchase_request_lines"("awardedPurchaseOrderId");
CREATE INDEX IF NOT EXISTS "purchase_order_lines_purchaseRequestLineId_idx"
  ON "purchase_order_lines"("purchaseRequestLineId");
CREATE INDEX IF NOT EXISTS "purchase_order_lines_procurementQuoteLineId_idx"
  ON "purchase_order_lines"("procurementQuoteLineId");

-- 8) Foreign keys
DO $$ BEGIN
  ALTER TABLE "purchase_request_lines"
    ADD CONSTRAINT "purchase_request_lines_awardedPurchaseOrderId_fkey"
    FOREIGN KEY ("awardedPurchaseOrderId") REFERENCES "purchase_orders"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "purchase_order_lines"
    ADD CONSTRAINT "purchase_order_lines_purchaseRequestLineId_fkey"
    FOREIGN KEY ("purchaseRequestLineId") REFERENCES "purchase_request_lines"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "purchase_order_lines"
    ADD CONSTRAINT "purchase_order_lines_procurementQuoteLineId_fkey"
    FOREIGN KEY ("procurementQuoteLineId") REFERENCES "procurement_quote_lines"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
