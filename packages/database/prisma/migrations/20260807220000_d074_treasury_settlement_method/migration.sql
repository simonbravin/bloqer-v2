-- D-074 / Q-054: settlement method + reference on Collection and Payment

DO $$ BEGIN
  CREATE TYPE "TreasurySettlementMethod" AS ENUM (
    'CASH',
    'BANK_TRANSFER',
    'CHECK',
    'CARD',
    'OTHER'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "collections"
  ADD COLUMN IF NOT EXISTS "paymentMethod" "TreasurySettlementMethod",
  ADD COLUMN IF NOT EXISTS "reference" TEXT;

ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "paymentMethod" "TreasurySettlementMethod",
  ADD COLUMN IF NOT EXISTS "reference" TEXT;
