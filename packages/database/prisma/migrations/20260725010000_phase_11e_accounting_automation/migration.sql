-- Phase 11E: accrual mapping events, reverse links, partial unique on journal source.

-- Enum values for AccountingMappingEventType
ALTER TYPE "AccountingMappingEventType" ADD VALUE IF NOT EXISTS 'SALES_INVOICE_ISSUED';
ALTER TYPE "AccountingMappingEventType" ADD VALUE IF NOT EXISTS 'SUPPLIER_INVOICE_ISSUED';

-- Reverse link on journal_entries
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "reversesEntryId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'journal_entries_reversesEntryId_fkey'
  ) THEN
    ALTER TABLE "journal_entries"
      ADD CONSTRAINT "journal_entries_reversesEntryId_fkey"
      FOREIGN KEY ("reversesEntryId") REFERENCES "journal_entries"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "journal_entries_reversesEntryId_key"
  ON "journal_entries"("reversesEntryId");

-- At most one non-cancelled journal per operational source (tenant+company+type+id).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "journal_entries"
    WHERE status <> 'CANCELLED'
      AND "sourceId" IS NOT NULL
    GROUP BY "tenantId", "companyId", "sourceType", "sourceId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Phase 11E: duplicate non-cancelled journal entries exist for the same source; resolve duplicates before deploying this migration';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "journal_entries_one_active_per_source_key"
ON "journal_entries" ("tenantId", "companyId", "sourceType", "sourceId")
WHERE status <> 'CANCELLED' AND "sourceId" IS NOT NULL;
