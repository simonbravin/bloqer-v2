-- D-047 amend: preserve physical resource qty for Total partida (materials/OC needQty)
ALTER TABLE "cost_analysis_lines" ADD COLUMN "partidaQuantity" DECIMAL(18,4);
ALTER TABLE "cost_analysis_lines" ADD COLUMN "isLumpSum" BOOLEAN NOT NULL DEFAULT false;
