/** AG09 regression of AR reporting consumers; isolated SQL only, no external providers. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, after, describe, it } from "node:test";
import { prisma } from "@bloqer/database";
import { assertAuditDatabaseIdentity } from "../testing/audit-fixture";
import { clearProjectAccessModeCache } from "../security/access";
import { ServiceError, type ServiceContext } from "../types";
import { getReceivableAgingReport } from "../aging/aging.service";
import { exportReceivableAgingCsv } from "../report-exports/report-export.service";
import { parseBuiltCsv } from "../report-exports/csv-export.service";
import { getProjectCashPositionProjection } from "../project-cash-flow/project-cash-position-projection.service";
import { getProjectCashProjectionReport } from "../reports/project-cash-projection.service";
import { getProjectCashFlowReport } from "../project-cash-flow/project-cash-flow.service";
import { getProjectAttributedCashBalance } from "../project-finance/project-attributed-cash.service";
import { createSalesInvoice, issueSalesInvoice } from "./sales-invoice.service";
import { registerArIncome } from "./register-ar-income.service";
import { createSalesCreditNoteFromInvoice, issueSalesCreditNote } from "./credit-debit-note.service";
import { createCollection } from "../treasury/collection.service";
import { buildAiExecutionContext } from "../ai/context";
import { getReceivablesTool } from "../ai/tools/finance-tools";

const denied = (e: unknown) => e instanceof ServiceError && ["FORBIDDEN", "NOT_FOUND"].includes(e.code);
describe("AG09 AR aging, exports and project cash consumers", { skip: process.env.BLOQER_AUDIT_LIVE !== "1", concurrency: false }, () => {
  const tenantId = randomUUID(), foreignTenantId = randomUUID(), companyId = randomUUID(), companyB = randomUUID(), actorId = randomUUID(), pmId = randomUUID(), foreignContactId = randomUUID();
  const ctx: ServiceContext = { tenantId, companyId, actorUserId: actorId, roles: ["OWNER"] };
  const pm: ServiceContext = { ...ctx, actorUserId: pmId, roles: ["PROJECT_MANAGER"] };
  const other: ServiceContext = { ...ctx, companyId: companyB };
  const global: ServiceContext = { ...ctx, companyId: null };
  const date = "2026-11-05";
  let verified = false;
  before(async () => {
    await assertAuditDatabaseIdentity(prisma); verified = true; clearProjectAccessModeCache();
    await prisma.$transaction(async (tx) => {
      await tx.tenant.createMany({ data: [tenantId, foreignTenantId].map((id) => ({ id, name: "Synthetic AG09 AR consumers", slug: "audit-ar-consumers-" + id, projectAccessMode: "MEMBERSHIP_SCOPED" as const })) });
      await tx.company.createMany({ data: [companyId, companyB].map((id) => ({ id, tenantId, name: "Synthetic consumers " + id, country: "AR" })) });
      await tx.user.createMany({ data: [actorId, pmId].map((id) => ({ id, email: "audit-consumers-" + id + "@example.test" })) });
      await tx.userMembership.createMany({ data: [{ tenantId, companyId, userId: actorId, roles: ["OWNER"] }, { tenantId, companyId, userId: pmId, roles: ["PROJECT_MANAGER"] }] });
      await tx.contact.create({ data: { id: foreignContactId, tenantId: foreignTenantId, legalName: "Foreign synthetic consumers" } });
      await tx.tenantModuleSetting.create({ data: { tenantId, moduleKey: "ACCOUNTING", isEnabled: false } });
    }, { timeout: 30_000 });
  });
  after(async () => {
    clearProjectAccessModeCache(); if (!verified) return;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.notification.deleteMany({ where: { tenantId } });
        await tx.accountMovement.deleteMany({ where: { tenantId } });
        await tx.collection.deleteMany({ where: { tenantId } });
        await tx.receivableCreditApplication.deleteMany({ where: { tenantId } });
        await tx.receivable.deleteMany({ where: { tenantId } });
        await tx.salesInvoiceLine.deleteMany({ where: { invoice: { tenantId } } });
        await tx.salesInvoice.deleteMany({ where: { tenantId } });
        await tx.auditLog.deleteMany({ where: { tenantId } });
        await tx.projectMembership.deleteMany({ where: { tenantId } });
        await tx.project.deleteMany({ where: { tenantId } });
        await tx.treasuryAccount.deleteMany({ where: { tenantId } });
        await tx.period.deleteMany({ where: { tenantId } });
        await tx.contactRole.deleteMany({ where: { tenantId } });
        await tx.contact.deleteMany({ where: { tenantId: { in: [tenantId, foreignTenantId] } } });
        await tx.userMembership.deleteMany({ where: { tenantId } });
        await tx.tenantModuleSetting.deleteMany({ where: { tenantId } });
        await tx.company.deleteMany({ where: { tenantId } });
        await tx.tenant.deleteMany({ where: { id: { in: [tenantId, foreignTenantId] } } });
        await tx.user.deleteMany({ where: { id: { in: [actorId, pmId] } } });
      }, { timeout: 60_000 });
    } finally { await prisma.$disconnect(); }
  });
  async function scope() {
    const client = await prisma.contact.create({ data: { tenantId, legalName: "Synthetic consumer " + randomUUID(), country: "AR", roles: { create: { tenantId, role: "CLIENT" } } } });
    const project = await prisma.project.create({ data: { tenantId, companyId: null, clientContactId: client.id, code: randomUUID(), name: "Synthetic consumer work", country: "AR", status: "ACTIVE" } });
    return { client, project };
  }
  type Scope = Awaited<ReturnType<typeof scope>>;
  async function invoice(s: Scope, context = ctx, amount = "100", currency = "ARS") {
    const inv = await createSalesInvoice({ projectId: s.project.id, clientContactId: s.client.id, issueDate: date, dueDate: date, currency, fxRate: currency === "ARS" ? undefined : "1250", invoiceLetter: "C", iibbPerceptionRate: "0", externalInvoiceRef: null, lines: [{ description: "Synthetic", quantity: "1", unitPrice: amount, taxRate: "0", discountPct: "0", sortOrder: 0 }] }, context);
    await issueSalesInvoice(inv.id, context); return prisma.receivable.findUniqueOrThrow({ where: { salesInvoiceId: inv.id } });
  }
  async function credit(parentId: string, amount: string) {
    const nc = await createSalesCreditNoteFromInvoice({ parentSalesInvoiceId: parentId, lines: [{ description: "Synthetic credit", quantity: "1", unitPrice: amount, taxRate: "0" }] }, ctx);
    await issueSalesCreditNote(nc.id, ctx); return nc;
  }
  async function cash(receivableId: string, context = ctx, amount = "20") {
    const bank = await prisma.treasuryAccount.create({ data: { tenantId, companyId: context.companyId, name: "Synthetic consumers bank " + randomUUID(), type: "BANK", currency: "ARS" } });
    return createCollection({ receivableId, accountId: bank.id, collectionDate: date, reference: null, amount, idempotencyKey: randomUUID() }, context);
  }
  it("cannot override an anchored company through the aging filter", async () => {
    await assert.rejects(() => getReceivableAgingReport({ companyId: companyB }, ctx), denied);
    await assert.rejects(() => exportReceivableAgingCsv({ companyId: companyB }, ctx), denied);
  });
  it("keeps corporate-only aging separate from project receivables", async () => {
    const s = await scope(); await invoice(s, ctx, "200");
    await registerArIncome({ clientContactId: s.client.id, issueDate: date, dueDate: date, currency: "ARS", invoiceLetter: "C", iibbPerceptionRate: "0", externalInvoiceRef: null, idempotencyKey: randomUUID(), lines: [{ description: "Corporate", quantity: "1", unitPrice: "100", taxRate: "0", discountPct: "0", sortOrder: 0 }] }, ctx);
    const report = await getReceivableAgingReport({ corporateOnly: true, contactId: s.client.id, asOfDate: date }, ctx);
    assert.equal(report.totals?.totalBalance, "100.00");
    assert.ok(report.rows.flatMap((row) => row.items).every((item) => item.projectId === null));
  });
  it("exports partial credits and separates ARS and USD instead of adding their totals", async () => {
    const s = await scope(), ars = await invoice(s); await credit(ars.salesInvoiceId, "30"); await invoice(s, ctx, "10", "USD");
    const filters = { contactId: s.client.id, asOfDate: date };
    const report = await getReceivableAgingReport(filters, ctx);
    assert.equal(report.totals, null); assert.equal(report.byCurrency.ARS?.totalBalance, "70.00"); assert.equal(report.byCurrency.USD?.totalBalance, "10.00");
    const csv = parseBuiltCsv((await exportReceivableAgingCsv(filters, ctx)).content);
    const row = csv.rows.find((r) => r[csv.headers.indexOf("Moneda")] === "ARS");
    assert.ok(row); assert.equal(row[csv.headers.indexOf("MontoAcreditado")], "30.00"); assert.equal(row[csv.headers.indexOf("Saldo")], "70.00");
  });
  it("keeps real AI tool totals separated by currency without calling a model", async () => {
    const s = await scope(); await invoice(s, ctx, "100"); await invoice(s, ctx, "10", "USD");
    const result = await getReceivablesTool.execute(buildAiExecutionContext({ service: ctx, currentProjectId: s.project.id }), {});
    const data = result.data as { totals: unknown; byCurrency: Record<string, { totalBalance: string }> };
    assert.equal(data.totals, null);
    assert.equal(data.byCurrency.ARS?.totalBalance, "100.00");
    assert.equal(data.byCurrency.USD?.totalBalance, "10.00");
    assert.equal(result.provenance.entityId, s.project.id);
  });
  it("rejects inconsistent invoice and foreign contact parents before aging or CSV disclosure", async () => {
    const s = await scope(), r = await invoice(s);
    await prisma.receivable.update({ where: { id: r.id }, data: { clientContactId: foreignContactId } });
    try {
      await assert.rejects(() => getReceivableAgingReport({ projectId: s.project.id }, ctx), denied);
      await assert.rejects(() => exportReceivableAgingCsv({ projectId: s.project.id }, ctx), denied);
    } finally { await prisma.receivable.update({ where: { id: r.id }, data: { clientContactId: s.client.id } }); }
    await prisma.receivable.update({ where: { id: r.id }, data: { originalAmount: "101" } });
    try { await assert.rejects(() => getReceivableAgingReport({ projectId: s.project.id }, ctx), denied); }
    finally { await prisma.receivable.update({ where: { id: r.id }, data: { originalAmount: "100" } }); }
  });
  it("subtracts non-cash credits in both cash projections without adding them to received cash", async () => {
    const s = await scope(), r = await invoice(s); await credit(r.salesInvoiceId, "30"); await cash(r.id);
    const position = await getProjectCashPositionProjection(s.project.id, { asOfDate: date }, ctx);
    assert.equal(position.currencies[0]?.receivablesDue, "50.00"); assert.equal(position.currencies[0]?.collectionsReceived, "20.00"); assert.equal(position.currencies[0]?.projectedCapital, "70.00");
    const projection = await getProjectCashProjectionReport(s.project.id, { dateFrom: date, dateTo: "2026-12-31" }, ctx);
    assert.equal(projection.currencies[0]?.totalExpectedInflows, "50.00");
  });
  it("requires membership on every cash report and permits assigned project finance", async () => {
    const s = await scope(); await invoice(s);
    const calls = [() => getProjectCashFlowReport(s.project.id, {}, pm), () => getProjectAttributedCashBalance(s.project.id, pm), () => getProjectCashPositionProjection(s.project.id, {}, pm), () => getProjectCashProjectionReport(s.project.id, {}, pm)];
    for (const call of calls) await assert.rejects(call, denied);
    await prisma.projectMembership.create({ data: { tenantId, projectId: s.project.id, userId: pmId } }); clearProjectAccessModeCache();
    for (const call of calls) assert.ok(await call());
  });
  it("limits shared-project cash totals to document company and preserves a global view", async () => {
    const s = await scope(), a = await invoice(s), b = await invoice(s, other);
    await cash(a.id, ctx, "20"); await cash(b.id, other, "40");
    const scoped = await getProjectCashFlowReport(s.project.id, { dateFrom: date, dateTo: date }, ctx);
    const all = await getProjectCashFlowReport(s.project.id, { dateFrom: date, dateTo: date }, global);
    assert.equal(scoped.currencies[0]?.totalInflows, "20.00"); assert.equal(all.currencies[0]?.totalInflows, "60.00");
    assert.equal((await getProjectAttributedCashBalance(s.project.id, ctx)).byCurrency[0]?.netBalance, "20.00");
    assert.equal((await getProjectAttributedCashBalance(s.project.id, global)).byCurrency[0]?.netBalance, "60.00");
  });
});
