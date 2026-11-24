/** Maintained deployment contract: read-only SQL, shared by Vercel and isolated CI. */
export const INVITATION_MIGRATION = "20261123180000_supplier_quote_invitations";
const REQUIRED_COLUMNS = [
  "id", "tenantId", "companyId", "projectId", "purchaseRequestId", "supplierContactId",
  "tokenHash", "expiresAt", "revokedAt", "revokedBy", "requestSnapshot", "requestFingerprint",
  "responsePayload", "responseHash", "respondedAt", "importedQuoteId", "importedAt", "importedBy",
  "createdBy", "updatedBy", "createdAt", "updatedAt",
];
const REQUIRED_CONSTRAINTS = [
  "procurement_quote_invitations_pkey", "quote_invitation_tenant_fk", "quote_invitation_company_fk",
  "quote_invitation_project_fk", "quote_invitation_request_fk", "quote_invitation_supplier_fk",
  "quote_invitation_import_fk", "quote_invitation_response_complete", "quote_invitation_import_requires_response",
];
const REQUIRED_INDEXES = [
  "procurement_quote_invitations_pkey", "procurement_quote_invitations_tokenHash_key",
  "procurement_quote_invitations_importedQuoteId_key", "procurement_quote_invitations_tenantId_purchaseRequestId_idx",
  "procurement_quote_invitations_tenantId_companyId_projectId_idx", "quote_invitation_one_pending",
];

export function assertDeploymentSchema({ migrations, columns, constraints, indexes }) {
  if (!migrations.some(row => row.finished_at && !row.rolled_back_at) ||
      migrations.some(row => !row.finished_at && !row.rolled_back_at)) {
    throw new Error(`Deployment schema: migration ${INVITATION_MIGRATION} is not complete`);
  }
  for (const name of REQUIRED_COLUMNS) {
    if (!columns.some(row => row.column_name === name)) {
      throw new Error(`Deployment schema: missing invitation column ${name}`);
    }
  }
  for (const name of ["tenantId", "companyId", "projectId", "purchaseRequestId", "supplierContactId", "tokenHash"]) {
    if (columns.find(row => row.column_name === name)?.is_nullable !== "NO") {
      throw new Error(`Deployment schema: invitation column ${name} must be required`);
    }
  }
  for (const name of REQUIRED_CONSTRAINTS) {
    if (!constraints.some(row => row.conname === name && row.convalidated)) {
      throw new Error(`Deployment schema: missing or unvalidated constraint ${name}`);
    }
  }
  for (const name of REQUIRED_INDEXES) {
    if (!indexes.some(row => row.indexname === name && row.indisvalid && row.indisready)) {
      throw new Error(`Deployment schema: missing or invalid index ${name}`);
    }
  }
  return { migration: INVITATION_MIGRATION, columns: REQUIRED_COLUMNS.length,
    constraints: REQUIRED_CONSTRAINTS.length, indexes: REQUIRED_INDEXES.length };
}

export async function verifyDeploymentSchema(db) {
  return db.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '15s'");
    const migrations = await tx.$queryRawUnsafe(
      "SELECT finished_at, rolled_back_at FROM public._prisma_migrations WHERE migration_name = $1",
      INVITATION_MIGRATION,
    );
    const columns = await tx.$queryRawUnsafe(
      "SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'procurement_quote_invitations'",
    );
    const constraints = await tx.$queryRawUnsafe(
      "SELECT conname, convalidated FROM pg_constraint WHERE conrelid = to_regclass('public.procurement_quote_invitations')",
    );
    const indexes = await tx.$queryRawUnsafe(
      "SELECT c.relname AS indexname, i.indisvalid, i.indisready FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE i.indrelid = to_regclass('public.procurement_quote_invitations')",
    );
    return assertDeploymentSchema({ migrations, columns, constraints, indexes });
  }, { timeout: 30_000 });
}
