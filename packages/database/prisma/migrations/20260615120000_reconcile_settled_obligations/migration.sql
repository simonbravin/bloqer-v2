-- BR-AR-002: reconcile settled obligations whose stored status was not updated to PAID.
UPDATE "payables"
SET "status" = 'PAID', "updatedAt" = NOW()
WHERE "status" NOT IN ('PAID', 'CANCELLED')
  AND "paidAmount" >= "originalAmount";

UPDATE "receivables"
SET "status" = 'PAID', "updatedAt" = NOW()
WHERE "status" NOT IN ('PAID', 'CANCELLED')
  AND "paidAmount" >= "originalAmount";
