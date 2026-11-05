-- D-134. Historical movements retain their original amounts and unknown exchange rates.
ALTER TABLE "account_movements"
ADD COLUMN "fxRate" DECIMAL(18, 6),
ADD COLUMN "amountArs" DECIMAL(18, 4);
