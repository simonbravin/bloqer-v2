-- BR-SUB-005 / [D-082]: at most one non-cancelled successor per replaced certification.
-- Prisma cannot express partial unique indexes as @@unique.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT "replacesCertificationId"
      FROM "subcontract_certifications"
      WHERE "replacesCertificationId" IS NOT NULL
        AND status <> 'CANCELLED'
      GROUP BY "replacesCertificationId"
      HAVING COUNT(*) > 1
    ) dups
  ) THEN
    RAISE EXCEPTION
      'Cannot create subcontract_certifications_one_successor_per_predecessor_key: duplicate non-cancelled successors for the same replacesCertificationId exist.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "subcontract_certifications_one_successor_per_predecessor_key"
ON "subcontract_certifications" ("replacesCertificationId")
WHERE "replacesCertificationId" IS NOT NULL AND status <> 'CANCELLED';
