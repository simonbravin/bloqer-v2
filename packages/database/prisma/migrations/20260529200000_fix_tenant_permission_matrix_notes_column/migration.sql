-- Fix drift: 20260513220000 added "permission_matrix_notes" (snake_case) but Prisma/schema
-- use camelCase column names on tenants (e.g. platformInternalNotes). Rename only when needed.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tenants'
      AND column_name = 'permission_matrix_notes'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tenants'
      AND column_name = 'permissionMatrixNotes'
  ) THEN
    ALTER TABLE "tenants" RENAME COLUMN "permission_matrix_notes" TO "permissionMatrixNotes";
  END IF;
END $$;
