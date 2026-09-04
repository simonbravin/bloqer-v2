-- BR-PUR-024: cancelled / inactive award lines must not Restrict-block quote edit/delete.

-- 1) Heal: deactivate awards on cancelled OCs and clear quote-line FKs
UPDATE "purchase_order_lines" pol
SET
  "isActiveAward" = false,
  "procurementQuoteLineId" = NULL
FROM "purchase_orders" po
WHERE po."id" = pol."purchaseOrderId"
  AND po."status" = 'CANCELLED'
  AND (pol."isActiveAward" = true OR pol."procurementQuoteLineId" IS NOT NULL);

-- Inactive awards (any status) must not keep Restrict quote FKs
UPDATE "purchase_order_lines"
SET "procurementQuoteLineId" = NULL
WHERE "isActiveAward" = false
  AND "procurementQuoteLineId" IS NOT NULL;

-- Clear PR coverage cache pointing at cancelled / missing OCs
UPDATE "purchase_request_lines" prl
SET "awardedPurchaseOrderId" = NULL
WHERE prl."awardedPurchaseOrderId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "purchase_orders" po
    WHERE po."id" = prl."awardedPurchaseOrderId"
      AND po."status" <> 'CANCELLED'
  );

-- 2) FK: Restrict → SetNull on procurementQuoteLineId
ALTER TABLE "purchase_order_lines"
  DROP CONSTRAINT IF EXISTS "purchase_order_lines_procurementQuoteLineId_fkey";

ALTER TABLE "purchase_order_lines"
  ADD CONSTRAINT "purchase_order_lines_procurementQuoteLineId_fkey"
  FOREIGN KEY ("procurementQuoteLineId") REFERENCES "procurement_quote_lines"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
