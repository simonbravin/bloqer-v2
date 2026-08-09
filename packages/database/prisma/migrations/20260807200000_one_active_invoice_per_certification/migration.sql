-- One non-cancelled SalesInvoice per Certification (cert→factura integrity).
-- Prisma cannot express partial unique indexes as @@unique without blocking CANCELLED rows.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT "certificationId"
      FROM "sales_invoices"
      WHERE "certificationId" IS NOT NULL
        AND status <> 'CANCELLED'
      GROUP BY "certificationId"
      HAVING COUNT(*) > 1
    ) dups
  ) THEN
    RAISE EXCEPTION
      'Cannot create sales_invoices_one_active_per_certification_key: duplicate active invoices for the same certificationId exist. Cancel or merge duplicates first.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "sales_invoices_one_active_per_certification_key"
ON "sales_invoices" ("certificationId")
WHERE "certificationId" IS NOT NULL AND status <> 'CANCELLED';
