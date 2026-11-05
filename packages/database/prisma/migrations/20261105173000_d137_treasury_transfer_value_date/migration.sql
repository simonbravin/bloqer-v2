-- D-137. Keep the accounting date and leave unknown historical value dates empty.
ALTER TABLE "internal_transfers" ADD COLUMN "valueDate" DATE;
ALTER TABLE "account_movements" ADD COLUMN "valueDate" DATE;
