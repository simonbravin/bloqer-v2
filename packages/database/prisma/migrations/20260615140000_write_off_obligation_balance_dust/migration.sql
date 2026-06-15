-- Write off sub-cent obligation balance dust (MONEY_MODEL: tolerance 0.01 ARS).
-- Rows with 0 < (original - paid) <= 0.01 are treated as fully settled.

UPDATE "payables"
SET
  "paid_amount" = "original_amount",
  "status" = 'PAID',
  "updated_at" = NOW()
WHERE
  "status" NOT IN ('PAID', 'CANCELLED')
  AND ("original_amount" - "paid_amount") > 0
  AND ("original_amount" - "paid_amount") <= 0.01;

UPDATE "receivables"
SET
  "paid_amount" = "original_amount",
  "status" = 'PAID',
  "updated_at" = NOW()
WHERE
  "status" NOT IN ('PAID', 'CANCELLED')
  AND ("original_amount" - "paid_amount") > 0
  AND ("original_amount" - "paid_amount") <= 0.01;
