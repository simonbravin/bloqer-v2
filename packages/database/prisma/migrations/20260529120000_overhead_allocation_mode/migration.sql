-- Q-013: modo de imputación de GG — manual (% + filas) vs automático por peso de CD.

CREATE TYPE "OverheadAllocationMode" AS ENUM ('MANUAL', 'AUTO_WEIGHT');

ALTER TABLE "companies" ADD COLUMN "overheadAllocationMode" "OverheadAllocationMode" NOT NULL DEFAULT 'MANUAL';
