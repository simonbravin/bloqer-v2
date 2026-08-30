-- [D-105] One-step Autorizar y comprometer policy (default off).
ALTER TABLE "company_procurement_settings"
  ADD COLUMN IF NOT EXISTS "allowAuthorizeAndCommit" BOOLEAN NOT NULL DEFAULT false;
