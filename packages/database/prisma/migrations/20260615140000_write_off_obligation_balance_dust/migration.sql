-- Write off sub-cent obligation balance dust (MONEY_MODEL: tolerance 0.01 ARS).
-- Rows with 0 < (original - paid) <= 0.01 are treated as fully settled.

UPDATE "payables"
SET
  "paidAmount" = "originalAmount",
  "status" = 'PAID',
  "updatedAt" = NOW()
WHERE
  "status" NOT IN ('PAID', 'CANCELLED')
  AND ("originalAmount" - "paidAmount") > 0
  AND ("originalAmount" - "paidAmount") <= 0.01;

UPDATE "receivables"
SET
  "paidAmount" = "originalAmount",
  "status" = 'PAID',
  "updatedAt" = NOW()
WHERE
  "status" NOT IN ('PAID', 'CANCELLED')
  AND ("originalAmount" - "paidAmount") > 0
  AND ("originalAmount" - "paidAmount") <= 0.01;
