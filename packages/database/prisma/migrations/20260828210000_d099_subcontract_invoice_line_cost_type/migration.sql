-- D-099 follow-up: supplier invoice lines generated from subcontract certifications are
-- SUBCONTRACT by construction. The initial backfill left them on the MATERIAL default,
-- which mislabels the line in the invoice detail and in any typed report over legacy rows.

UPDATE "supplier_invoice_lines" sil
SET "costType" = 'SUBCONTRACT'
FROM "supplier_invoices" si
WHERE sil."invoiceId" = si.id
  AND si."subcontractCertificationId" IS NOT NULL
  AND sil."costType" IS DISTINCT FROM 'SUBCONTRACT';
