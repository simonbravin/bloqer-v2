-- ADR-Phase1-05: optional JSON notes per PermissionModule on read-only matrix UI.
ALTER TABLE "tenants" ADD COLUMN "permission_matrix_notes" JSONB;
