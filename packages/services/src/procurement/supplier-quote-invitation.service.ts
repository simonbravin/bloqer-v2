import { supplierQuoteLinksEnabled } from "@bloqer/config";
import { quoteInvitationRepository as repo, type QuoteInvitationDb } from "@bloqer/database";
import { supplierQuoteRequestSnapshotSchema, supplierQuoteResponseSchema, createProcurementQuoteSchema, type SupplierQuoteRequestSnapshot } from "@bloqer/validators";
import { ServiceError, type ServiceContext } from "../types";
import { log } from "../audit/audit.service";
import { hasTenantWideProjectAccess } from "../security/access";
import { canManageProcurementQuotes } from "./procurement-access";
import { assertPurchaseRequestScope } from "./purchase-request-scope";
import { assertProcurementTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { serializeQtyDecimal } from "../finance/money-decimal";
import { createProcurementQuoteInTransaction } from "./procurement-quote.service";
import { newQuoteInvitationToken, quoteInvitationDigest, QUOTE_INVITATION_LIFETIME_MS, QUOTE_INVITATION_UNAVAILABLE, assertQuoteInvitationOpen, validateSupplierQuoteResponse } from "./supplier-quote-invitation-policy";

type Invitation = NonNullable<Awaited<ReturnType<typeof repo.byId>>>;
type RequestRow = NonNullable<Awaited<ReturnType<typeof repo.request>>>;
function unavailable(): never { throw new ServiceError("NOT_FOUND", QUOTE_INVITATION_UNAVAILABLE); }
function enabled() { if (!supplierQuoteLinksEnabled()) unavailable(); }
function coherent(pr: RequestRow) {
  return pr.company.tenantId === pr.tenantId && pr.project.tenantId === pr.tenantId &&
    (!pr.project.companyId || pr.project.companyId === pr.companyId) && pr.company.status === "ACTIVE" && pr.tenant.status === "ACTIVE";
}
function fingerprint(pr: RequestRow) {
  return quoteInvitationDigest(JSON.stringify({ tenant: pr.tenantId, company: pr.companyId, project: pr.projectId,
    submittedAt: pr.submittedAt?.toISOString(), returnedAt: pr.returnedAt?.toISOString(), neededBy: pr.neededByDate?.toISOString(),
    lines: pr.lines.map(line => ({ id: line.id, description: line.description, unit: line.unit, quantity: serializeQtyDecimal(line.quantity), wbsNodeId: line.wbsNodeId })) }));
}
async function authorizeInternal(requestId: string, ctx: ServiceContext, db?: QuoteInvitationDb, mutate = false) {
  enabled();
  await assertProcurementTenantModule(ctx);
  if (!canManageProcurementQuotes(ctx.roles)) throw new ServiceError("FORBIDDEN", "Sin permisos para gestionar cotizaciones.");
  const pr = await repo.request(requestId, ctx.tenantId, db);
  if (!pr || !coherent(pr)) throw new ServiceError("NOT_FOUND", "Solicitud no encontrada.");
  await assertPurchaseRequestScope(pr, ctx, mutate ? "mutate" : "read");
  if (mutate && pr.status !== "SUBMITTED") throw new ServiceError("CONFLICT", "La solicitud no admite nuevas cotizaciones.");
  return pr;
}
function audit(row: Pick<Invitation, "id" | "tenantId" | "companyId" | "projectId" | "supplierContactId">, action: "created" | "revoked" | "responded" | "imported", actorUserId: string | null, db: QuoteInvitationDb, quoteId?: string) {
  return log({ tenantId: row.tenantId, companyId: row.companyId, projectId: row.projectId,
    actorUserId, action: `procurement_quote_invitation.${action}`, entityType: "ProcurementQuoteInvitation", entityId: row.id,
    after: { source: actorUserId ? "internal_review" : "supplier_link", supplierContactId: row.supplierContactId, ...(quoteId ? { quoteId } : {}) } }, db);
}

export async function createSupplierQuoteInvitation(requestId: string, supplierContactId: string, ctx: ServiceContext) {
  const first = await authorizeInternal(requestId, ctx, undefined, true);
  return repo.transaction(async db => {
    await repo.lockScope(first.projectId, first.id, ctx.tenantId, db);
    const pr = await authorizeInternal(requestId, ctx, db, true);
    const supplier = await repo.supplier(supplierContactId, ctx.tenantId, db);
    if (!supplier) throw new ServiceError("VALIDATION", "Elegí un proveedor activo de esta empresa.");
    const snapshot: SupplierQuoteRequestSnapshot = supplierQuoteRequestSnapshotSchema.parse({ version: 1,
      companyName: pr.company.legalName || pr.company.name, projectName: pr.project.name,
      requestCode: `SC-${String(pr.number).padStart(3, "0")}`, supplierName: supplier.fantasyName || supplier.legalName,
      lines: pr.lines.map(line => ({ id: line.id, description: line.description, quantity: serializeQtyDecimal(line.quantity), unit: line.unit })),
    });
    if (Buffer.byteLength(JSON.stringify(snapshot), "utf8") > 256 * 1024) throw new ServiceError("VALIDATION", "La solicitud supera el tamaño admitido para compartir por enlace.");
    const previous = await repo.pending(pr.id, supplierContactId, ctx.tenantId, db);
    await repo.revokePending(pr.id, supplierContactId, ctx.tenantId, ctx.actorUserId, db);
    for (const row of previous) await audit(row, "revoked", ctx.actorUserId, db);
    const token = newQuoteInvitationToken();
    const row = await repo.create({ tenantId: ctx.tenantId, companyId: pr.companyId, projectId: pr.projectId,
      purchaseRequestId: pr.id, supplierContactId, tokenHash: quoteInvitationDigest(token),
      expiresAt: new Date(Date.now() + QUOTE_INVITATION_LIFETIME_MS), requestSnapshot: snapshot,
      requestFingerprint: fingerprint(pr), createdBy: ctx.actorUserId, updatedBy: ctx.actorUserId }, db);
    await audit(row, "created", ctx.actorUserId, db);
    return { id: row.id, token, expiresAt: row.expiresAt.toISOString(), snapshot };
  });
}

export async function listSupplierQuoteInvitations(requestId: string, ctx: ServiceContext) {
  const pr = await authorizeInternal(requestId, ctx);
  return (await repo.list(requestId, ctx.tenantId, pr.companyId, pr.projectId)).map(row => ({ id: row.id, supplierContactId: row.supplierContactId,
    snapshot: supplierQuoteRequestSnapshotSchema.parse(row.requestSnapshot), response: row.responsePayload ? supplierQuoteResponseSchema.parse(row.responsePayload) : null,
    expiresAt: row.expiresAt.toISOString(), revokedAt: row.revokedAt?.toISOString() ?? null,
    respondedAt: row.respondedAt?.toISOString() ?? null, importedAt: row.importedAt?.toISOString() ?? null,
    importedQuoteId: row.importedQuoteId }));
}

export async function revokeSupplierQuoteInvitation(id: string, requestId: string, ctx: ServiceContext) {
  const pr = await authorizeInternal(requestId, ctx);
  await repo.transaction(async db => {
    await repo.lockScope(pr.projectId, pr.id, ctx.tenantId, db);
    await authorizeInternal(requestId, ctx, db);
    await repo.lock(id, ctx.tenantId, db);
    const row = await repo.byId(id, ctx.tenantId, db);
    if (!row || row.purchaseRequestId !== pr.id || row.companyId !== pr.companyId || row.projectId !== pr.projectId) unavailable();
    if (!row.revokedAt) {
      await repo.update(id, ctx.tenantId, { revokedAt: new Date(), revokedBy: ctx.actorUserId, updatedBy: ctx.actorUserId }, db);
      await audit(row, "revoked", ctx.actorUserId, db);
    }
  });
}

/** Check the delegator's current authority without fabricating an internal actor for the supplier. */
async function externalContext(row: Invitation, db: QuoteInvitationDb) {
  assertQuoteInvitationOpen(row);
  const pr = await repo.request(row.purchaseRequestId, row.tenantId, db);
  if (!pr || !coherent(pr) || pr.companyId !== row.companyId || pr.projectId !== row.projectId ||
      pr.status !== "SUBMITTED" || pr.project.status !== "ACTIVE" || fingerprint(pr) !== row.requestFingerprint) unavailable();
  const supplier = await repo.supplier(row.supplierContactId, row.tenantId, db);
  if (!supplier) unavailable();
  const { membership, projectMember, modules } = await repo.authority(row.createdBy, row.tenantId, row.projectId, db);
  if (!membership || (membership.companyId && membership.companyId !== row.companyId) ||
    !canManageProcurementQuotes(membership.roles) || modules.some(module => module.moduleKey === "PROCUREMENT" && !module.isEnabled) ||
    (pr.tenant.projectAccessMode === "MEMBERSHIP_SCOPED" && !hasTenantWideProjectAccess(membership.roles) && !projectMember)) unavailable();
  assertQuoteInvitationOpen(row); // Recheck after awaited authorization, including lock delays.
  return { pr, snapshot: supplierQuoteRequestSnapshotSchema.parse(row.requestSnapshot) };
}

async function withExternal<T>(id: string, token: string, work: (row: Invitation, db: QuoteInvitationDb) => Promise<T>): Promise<T> {
  enabled();
  if (!/^[a-f0-9]{64}$/.test(token) || !/^[0-9a-f-]{36}$/i.test(id)) unavailable();
  const hash = quoteInvitationDigest(token);
  const first = await repo.byToken(id, hash);
  if (!first) unavailable();
  return repo.transaction(async db => {
    await repo.lockScope(first.projectId, first.purchaseRequestId, first.tenantId, db);
    await repo.lock(first.id, first.tenantId, db);
    const row = await repo.byToken(id, hash, db);
    if (!row) unavailable();
    return work(row, db);
  });
}

export async function readSupplierQuoteInvitation(id: string, token: string) {
  return withExternal(id, token, async (row, db) => {
    const { snapshot } = await externalContext(row, db);
    if (row.respondedAt) return { state: "sent" as const };
    return { state: "open" as const, snapshot, expiresAt: row.expiresAt.toISOString() };
  });
}

export async function respondToSupplierQuoteInvitation(id: string, token: string, raw: unknown) {
  return withExternal(id, token, async (row, db) => {
    const { snapshot } = await externalContext(row, db);
    const response = validateSupplierQuoteResponse(raw, snapshot);
    const hash = quoteInvitationDigest(JSON.stringify(response));
    if (row.respondedAt) {
      if (row.responseHash !== hash) throw new ServiceError("CONFLICT", "Ya se recibió una respuesta. Para cambiarla, pedí otro enlace a Compras.");
      return { state: "sent" as const };
    }
    assertQuoteInvitationOpen(row);
    await repo.update(row.id, row.tenantId, { responsePayload: response, responseHash: hash, respondedAt: new Date(), updatedBy: null }, db);
    await audit(row, "responded", null, db);
    return { state: "sent" as const };
  });
}

export async function importSupplierQuoteInvitation(id: string, requestId: string, raw: unknown, fxRate: unknown, ctx: ServiceContext) {
  const first = await authorizeInternal(requestId, ctx, undefined, true);
  return repo.transaction(async db => {
    await repo.lockScope(first.projectId, first.id, ctx.tenantId, db);
    const pr = await authorizeInternal(requestId, ctx, db, true);
    await repo.lock(id, ctx.tenantId, db);
    const row = await repo.byId(id, ctx.tenantId, db);
    if (!row || row.purchaseRequestId !== requestId || row.companyId !== pr.companyId || row.projectId !== pr.projectId) unavailable();
    if (row.importedAt) {
      if (!row.importedQuoteId) throw new ServiceError("CONFLICT", "La respuesta ya fue incorporada; la cotización original fue eliminada.");
      return { id: row.importedQuoteId };
    }
    if (!row.respondedAt || !row.responsePayload || fingerprint(pr) !== row.requestFingerprint) throw new ServiceError("CONFLICT", "La respuesta no se puede incorporar a la solicitud actual.");
    const response = validateSupplierQuoteResponse(raw, supplierQuoteRequestSnapshotSchema.parse(row.requestSnapshot));
    const parsed = createProcurementQuoteSchema.safeParse({ ...response, purchaseRequestId: requestId, supplierContactId: row.supplierContactId, fxRate });
    if (!parsed.success) throw new ServiceError("VALIDATION", parsed.error.issues[0]?.message ?? "Revisá los datos.");
    const result = await createProcurementQuoteInTransaction(parsed.data, ctx, db);
    await repo.update(id, ctx.tenantId, { importedQuoteId: result.id, importedAt: new Date(), importedBy: ctx.actorUserId, updatedBy: ctx.actorUserId }, db);
    await audit(row, "imported", ctx.actorUserId, db, result.id);
    return result;
  });
}
