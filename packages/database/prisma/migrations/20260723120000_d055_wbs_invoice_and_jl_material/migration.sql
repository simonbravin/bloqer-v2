-- D-055: WBS on project supplier invoice lines + jobsite log material usage
ALTER TABLE "supplier_invoice_lines" ADD COLUMN IF NOT EXISTS "wbsNodeId" TEXT;
ALTER TABLE "jobsite_log_material_usages" ADD COLUMN IF NOT EXISTS "wbsNodeId" TEXT;

CREATE INDEX IF NOT EXISTS "supplier_invoice_lines_wbsNodeId_idx" ON "supplier_invoice_lines"("wbsNodeId");
CREATE INDEX IF NOT EXISTS "jobsite_log_material_usages_wbsNodeId_idx" ON "jobsite_log_material_usages"("wbsNodeId");

DO $$ BEGIN
  ALTER TABLE "supplier_invoice_lines"
    ADD CONSTRAINT "supplier_invoice_lines_wbsNodeId_fkey"
    FOREIGN KEY ("wbsNodeId") REFERENCES "wbs_nodes"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "jobsite_log_material_usages"
    ADD CONSTRAINT "jobsite_log_material_usages_wbsNodeId_fkey"
    FOREIGN KEY ("wbsNodeId") REFERENCES "wbs_nodes"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;