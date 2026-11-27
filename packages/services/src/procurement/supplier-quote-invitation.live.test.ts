import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, after, describe, it } from "node:test";
import { prisma, quoteInvitationRepository as repo } from "@bloqer/database";
import { assertAuditDatabaseIdentity } from "../testing/audit-fixture";
import { clearProjectAccessModeCache } from "../security/access";
import type { ServiceContext } from "../types";
import { createSupplierQuoteInvitation, readSupplierQuoteInvitation, respondToSupplierQuoteInvitation, importSupplierQuoteInvitation, listSupplierQuoteInvitations, revokeSupplierQuoteInvitation } from "./supplier-quote-invitation.service";

describe("D-149 supplier quote links on isolated SQL", { skip: process.env.BLOQER_AUDIT_LIVE !== "1", concurrency: false }, () => {
  const tenantId = randomUUID(), foreignTenant = randomUUID(), companyId = randomUUID(), otherCompany = randomUUID(), foreignCompany = randomUUID();
  const actorUserId = randomUUID(), supplierId = randomUUID(), foreignSupplier = randomUUID();
  const projectId = randomUUID(), foreignProject = randomUUID();
  const ctx: ServiceContext = { tenantId, companyId, actorUserId, roles: ["OWNER"] };
  const tenants = { in: [tenantId, foreignTenant] };
  const previousFlag = process.env.BLOQER_PROCUREMENT_SUPPLIER_LINKS_ENABLED;
  let verified = false, number = 0;
  before(async () => {
    await assertAuditDatabaseIdentity(prisma); verified = true;
    process.env.BLOQER_PROCUREMENT_SUPPLIER_LINKS_ENABLED = "true";
    clearProjectAccessModeCache();
    await prisma.tenant.createMany({ data: [tenantId, foreignTenant].map(id => ({ id, name: "Synthetic supplier link", slug: `supplier-link-${id}`, projectAccessMode: "MEMBERSHIP_SCOPED" as const })) });
    await prisma.company.createMany({ data: [{ id: companyId, tenantId, name: "Company A" }, { id: otherCompany, tenantId, name: "Company B" }, { id: foreignCompany, tenantId: foreignTenant, name: "Foreign company" }] });
    await prisma.user.create({ data: { id: actorUserId, email: `${actorUserId}@example.invalid`, status: "ACTIVE" } });
    await prisma.userMembership.createMany({ data: [{ userId: actorUserId, tenantId, roles: ["OWNER"] }, { userId: actorUserId, tenantId: foreignTenant, roles: ["OWNER"] }] });
    await prisma.contact.createMany({ data: [{ id: supplierId, tenantId, legalName: "Synthetic supplier A" }, { id: foreignSupplier, tenantId: foreignTenant, legalName: "Synthetic supplier B" }] });
    await prisma.contactRole.createMany({ data: [{ tenantId, contactId: supplierId, role: "SUPPLIER" }, { tenantId: foreignTenant, contactId: foreignSupplier, role: "SUPPLIER" }] });
    await prisma.project.createMany({ data: [{ id: projectId, tenantId, companyId: null, clientContactId: supplierId, code: randomUUID(), name: "Shared project", status: "ACTIVE", country: "AR" }, { id: foreignProject, tenantId: foreignTenant, companyId: foreignCompany, clientContactId: foreignSupplier, code: randomUUID(), name: "Foreign project", status: "ACTIVE", country: "AR" }] });
    await prisma.companyProcurementSettings.createMany({ data: [companyId, otherCompany, foreignCompany].map(companyId => ({ companyId, minQuotesRequired: 1, apPaymentNotificationChannel: "IN_APP" as const })) });
  });
  after(async () => {
    if (previousFlag === undefined) delete process.env.BLOQER_PROCUREMENT_SUPPLIER_LINKS_ENABLED; else process.env.BLOQER_PROCUREMENT_SUPPLIER_LINKS_ENABLED = previousFlag;
    clearProjectAccessModeCache();
    if (!verified) return;
    try {
      await prisma.$transaction(async tx => {
        await tx.procurementQuoteInvitation.deleteMany({ where: { tenantId: tenants } });
        await tx.procurementQuoteLine.deleteMany({ where: { procurementQuote: { tenantId: tenants } } });
        await tx.procurementQuote.deleteMany({ where: { tenantId: tenants } });
        await tx.purchaseRequestLine.deleteMany({ where: { purchaseRequest: { tenantId: tenants } } });
        await tx.purchaseRequest.deleteMany({ where: { tenantId: tenants } });
        await tx.auditLog.deleteMany({ where: { tenantId: tenants } });
        await tx.projectMembership.deleteMany({ where: { tenantId: tenants } });
        await tx.project.deleteMany({ where: { tenantId: tenants } });
        await tx.contactRole.deleteMany({ where: { tenantId: tenants } });
        await tx.contact.deleteMany({ where: { tenantId: tenants } });
        await tx.companyProcurementSettings.deleteMany({ where: { companyId: { in: [companyId, otherCompany, foreignCompany] } } });
        await tx.userMembership.deleteMany({ where: { tenantId: tenants } });
        await tx.tenantModuleSetting.deleteMany({ where: { tenantId: tenants } });
        await tx.company.deleteMany({ where: { tenantId: tenants } });
        await tx.tenant.deleteMany({ where: { id: tenants } });
        await tx.user.delete({ where: { id: actorUserId } });
      }, { timeout: 30_000 });
    } finally { await prisma.$disconnect(); }
  });
  async function invitation(context = ctx, supplier = supplierId, project = projectId) {
    const request = await prisma.purchaseRequest.create({ data: { tenantId: context.tenantId, companyId: context.companyId!, projectId: project, number: ++number, status: "SUBMITTED", submittedAt: new Date(), notes: "PRIVATE INTERNAL NOTES", lines: { create: { description: "Synthetic material", quantity: "2.5", unit: "kg", budgetUnitCostSnapshot: "999" } } } });
    return { requestId: request.id, ...(await createSupplierQuoteInvitation(request.id, supplier, context)) };
  }
  type Invitation = Awaited<ReturnType<typeof invitation>>;
  const payload = (link: Invitation) => ({ version: 1, currency: "ARS", pricesIncludeTax: false, iibbPerceptionRate: "0", leadTimeDays: 2, validUntil: "2050-01-01", notes: "Offer", lines: link.snapshot.lines.map(line => ({ purchaseRequestLineId: line.id, offerKind: "QUOTED", unitPrice: "12", taxRate: "21", discountPct: "0" })) });
  it("returns only minimal snapshot and blocks token swapping across companies and tenants", async () => {
    const a = await invitation(), b = await invitation({ ...ctx, companyId: otherCompany });
    const c = await invitation({ ...ctx, tenantId: foreignTenant, companyId: foreignCompany }, foreignSupplier, foreignProject);
    const view = await readSupplierQuoteInvitation(a.id, a.token);
    assert.equal(view.state, "open"); assert.ok(!JSON.stringify(view).includes("PRIVATE")); assert.ok(!JSON.stringify(view).includes("budgetUnitCost"));
    assert.deepEqual(Object.keys(a.snapshot).sort(), ["companyName", "lines", "projectName", "requestCode", "supplierName", "version"]);
    for (const other of [b, c]) {
      await assert.rejects(() => readSupplierQuoteInvitation(other.id, a.token));
      await assert.rejects(() => listSupplierQuoteInvitations(other.requestId, ctx));
      await assert.rejects(() => importSupplierQuoteInvitation(a.id, other.requestId, payload(a), "", ctx));
    }
    await assert.rejects(() => createSupplierQuoteInvitation(a.requestId, foreignSupplier, ctx));
  });
  it("stores only token hashes and revokes a previous pending link", async () => {
    const a = await invitation(); const b = await createSupplierQuoteInvitation(a.requestId, supplierId, ctx);
    await assert.rejects(() => readSupplierQuoteInvitation(a.id, a.token));
    assert.equal((await readSupplierQuoteInvitation(b.id, b.token)).state, "open");
    const stored = await prisma.procurementQuoteInvitation.findUniqueOrThrow({ where: { id: b.id } });
    assert.notEqual(stored.tokenHash, b.token); assert.ok(!JSON.stringify(stored).includes(b.token));
  });
  it("requires an enabled module, current issuer role, company and project access", async () => {
    const a = await invitation();
    const membership = { userId_tenantId: { userId: actorUserId, tenantId } };
    await prisma.userMembership.update({ where: membership, data: { roles: ["PROCUREMENT"], companyId: otherCompany } });
    await assert.rejects(() => readSupplierQuoteInvitation(a.id, a.token));
    await prisma.userMembership.update({ where: membership, data: { companyId: null } });
    await assert.rejects(() => readSupplierQuoteInvitation(a.id, a.token));
    await prisma.projectMembership.create({ data: { tenantId, projectId, userId: actorUserId } });
    assert.equal((await readSupplierQuoteInvitation(a.id, a.token)).state, "open");
    await prisma.tenantModuleSetting.create({ data: { tenantId, moduleKey: "PROCUREMENT", isEnabled: false } });
    await assert.rejects(() => readSupplierQuoteInvitation(a.id, a.token));
    await prisma.tenantModuleSetting.deleteMany({ where: { tenantId } });
    await prisma.userMembership.update({ where: membership, data: { roles: ["OWNER"] } });
    await prisma.user.update({ where: { id: actorUserId }, data: { status: "SUSPENDED" } });
    await assert.rejects(() => readSupplierQuoteInvitation(a.id, a.token));
    await prisma.user.update({ where: { id: actorUserId }, data: { status: "ACTIVE" } });
  });
  it("rejects expired, revoked and changed requests", async () => {
    const a = await invitation(), b = await invitation(), c = await invitation();
    await prisma.procurementQuoteInvitation.update({ where: { id: a.id }, data: { expiresAt: new Date(0) } });
    await revokeSupplierQuoteInvitation(b.id, b.requestId, ctx);
    await prisma.purchaseRequestLine.updateMany({ where: { purchaseRequestId: c.requestId }, data: { quantity: "3" } });
    for (const row of [a, b, c]) { await assert.rejects(() => readSupplierQuoteInvitation(row.id, row.token)); await assert.rejects(() => respondToSupplierQuoteInvitation(row.id, row.token, payload(row))); }
  });
  it("rechecks access after waiting: revocation, replacement, expiry and SC cancellation win", async () => {
    for (const change of ["revoke", "replace", "expire", "cancel"] as const) {
      const a = await invitation();
      const transact = repo.transaction;
      let reached!: () => void, release!: () => void, intercepted = false;
      const atTransaction = new Promise<void>(resolve => { reached = resolve; });
      const gate = new Promise<void>(resolve => { release = resolve; });
      repo.transaction = async work => {
        if (!intercepted) { intercepted = true; reached(); await gate; }
        return transact(work);
      };
      const pending = respondToSupplierQuoteInvitation(a.id, a.token, payload(a));
      const rejected = assert.rejects(pending);
      try {
        await atTransaction;
        if (change === "revoke") await revokeSupplierQuoteInvitation(a.id, a.requestId, ctx);
        if (change === "replace") await createSupplierQuoteInvitation(a.requestId, supplierId, ctx);
        if (change === "expire") await prisma.procurementQuoteInvitation.update({ where: { id: a.id }, data: { expiresAt: new Date(0) } });
        if (change === "cancel") await prisma.purchaseRequest.update({ where: { id: a.requestId }, data: { status: "CANCELLED" } });
        release(); await rejected;
        assert.equal((await prisma.procurementQuoteInvitation.findUniqueOrThrow({ where: { id: a.id } })).respondedAt, null);
      } finally { release(); repo.transaction = transact; await pending.catch(() => undefined); }
    }
  });
  it("archiving the supplier blocks access and submission", async () => {
    const a = await invitation();
    await prisma.contact.update({ where: { id: supplierId }, data: { status: "ARCHIVED" } });
    try { await assert.rejects(() => readSupplierQuoteInvitation(a.id, a.token)); await assert.rejects(() => respondToSupplierQuoteInvitation(a.id, a.token, payload(a))); }
    finally { await prisma.contact.update({ where: { id: supplierId }, data: { status: "ACTIVE" } }); }
  });
  it("concurrent identical responses save one evidence and one external audit event", async () => {
    const a = await invitation();
    await Promise.all([respondToSupplierQuoteInvitation(a.id, a.token, payload(a)), respondToSupplierQuoteInvitation(a.id, a.token, payload(a))]);
    assert.deepEqual(await readSupplierQuoteInvitation(a.id, a.token), { state: "sent" });
    await assert.rejects(() => respondToSupplierQuoteInvitation(a.id, a.token, { ...payload(a), notes: "Changed" }));
    assert.equal(await prisma.procurementQuote.count({ where: { purchaseRequestId: a.requestId } }), 0);
    const audit = await prisma.auditLog.findMany({ where: { entityId: a.id, action: "procurement_quote_invitation.responded" } });
    assert.equal(audit.length, 1); assert.equal(audit[0]!.actorUserId, null); assert.equal((audit[0]!.after as { source: string }).source, "supplier_link");
  });
  it("review and concurrent import are atomic, immutable and idempotent without an order", async () => {
    const a = await invitation(); const original = payload(a);
    await respondToSupplierQuoteInvitation(a.id, a.token, original);
    // Access expiry does not discard received evidence.
    await revokeSupplierQuoteInvitation(a.id, a.requestId, ctx);
    const reviewed = { ...original, notes: "Reviewed by Compras" };
    const [first, second] = await Promise.all([importSupplierQuoteInvitation(a.id, a.requestId, reviewed, "", ctx), importSupplierQuoteInvitation(a.id, a.requestId, reviewed, "", ctx)]);
    assert.equal(first.id, second.id);
    const quote = await prisma.procurementQuote.findUniqueOrThrow({ where: { id: first.id } });
    assert.equal(quote.status, "RECEIVED"); assert.equal(quote.notes, reviewed.notes); assert.equal(quote.totalAmount.toString(), "36.3");
    const stored = await prisma.procurementQuoteInvitation.findUniqueOrThrow({ where: { id: a.id } });
    assert.equal((stored.responsePayload as { notes: string }).notes, original.notes); assert.equal(stored.importedBy, actorUserId);
    assert.equal(await prisma.purchaseOrder.count({ where: { purchaseRequestId: a.requestId } }), 0);
    await prisma.procurementQuoteLine.deleteMany({ where: { procurementQuoteId: first.id } });
    await prisma.procurementQuote.delete({ where: { id: first.id } });
    await assert.rejects(() => importSupplierQuoteInvitation(a.id, a.requestId, reviewed, "", ctx));
  });
  it("failed canonical import rolls back without consuming the response", async () => {
    const a = await invitation(); const response = { ...payload(a), currency: "USD" };
    await respondToSupplierQuoteInvitation(a.id, a.token, response);
    await assert.rejects(() => importSupplierQuoteInvitation(a.id, a.requestId, response, "", ctx));
    assert.equal(await prisma.procurementQuote.count({ where: { purchaseRequestId: a.requestId } }), 0);
    const row = await prisma.procurementQuoteInvitation.findUniqueOrThrow({ where: { id: a.id } });
    assert.equal(row.importedAt, null); assert.ok(row.respondedAt);
  });
});
