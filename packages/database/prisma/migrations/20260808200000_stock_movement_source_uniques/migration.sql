-- BR-INV-002 / P-LOG-05: prevent double-posted confirmed stock movements under concurrency.
-- Prisma cannot express partial unique indexes as @@unique.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT "purchaseReceiptLineId"
      FROM "stock_movements"
      WHERE "purchaseReceiptLineId" IS NOT NULL AND status = 'CONFIRMED'
      GROUP BY "purchaseReceiptLineId"
      HAVING COUNT(*) > 1
    ) dups
  ) THEN
    RAISE EXCEPTION
      'Cannot create stock_movements_one_confirmed_per_receipt_line_key: duplicate confirmed INs for the same receipt line exist.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT "sourceType", "sourceId"
      FROM "stock_movements"
      WHERE "sourceType" = 'CONSUMPTION' AND "sourceId" IS NOT NULL AND status = 'CONFIRMED'
      GROUP BY "sourceType", "sourceId"
      HAVING COUNT(*) > 1
    ) dups
  ) THEN
    RAISE EXCEPTION
      'Cannot create stock_movements_one_confirmed_consumption_per_source_key: duplicate confirmed consumptions for the same source exist.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT "warehouseTransferId", "type"
      FROM "stock_movements"
      WHERE "warehouseTransferId" IS NOT NULL
      GROUP BY "warehouseTransferId", "type"
      HAVING COUNT(*) > 1
    ) dups
  ) THEN
    RAISE EXCEPTION
      'Cannot create stock_movements_one_per_transfer_type_key: duplicate transfer legs exist.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "stock_movements_one_confirmed_per_receipt_line_key"
ON "stock_movements" ("purchaseReceiptLineId")
WHERE "purchaseReceiptLineId" IS NOT NULL AND status = 'CONFIRMED';

CREATE UNIQUE INDEX IF NOT EXISTS "stock_movements_one_confirmed_consumption_per_source_key"
ON "stock_movements" ("sourceType", "sourceId")
WHERE "sourceType" = 'CONSUMPTION' AND "sourceId" IS NOT NULL AND status = 'CONFIRMED';

CREATE UNIQUE INDEX IF NOT EXISTS "stock_movements_one_per_transfer_type_key"
ON "stock_movements" ("warehouseTransferId", "type")
WHERE "warehouseTransferId" IS NOT NULL;
