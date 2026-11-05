/** AG09 regression of AR reporting consumers; isolated SQL only, no external providers. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, after, describe, it } from "node:test";
import { prisma } from "@bloqer/database";
import { assertAuditDatabaseIdentity } from "../testing/audit-fixture";
import { clearProjectAccessModeCache } from "../security/access";
import { ServiceError, type ServiceContext } from "../types";
import { getPayableAgingReport, getReceivableAgingReport } from "../aging/aging.service";
import { exportReceivableAgingCsv } from "../report-exports/report-export.service";
import { parseBuiltCsv } from "../report-exports/csv-export.service";
import { getProjectCashPositionProjection } from "../project-cash-flow/project-cash-position-projection.service";
import { getProjectCashProjectionReport } from "../reports/project-cash-projection.service";
import { getProjectCashFlowReport } from "../project-cash-flow/project-cash-flow.service";
import { getProjectAttributedCashBalance } from "../project-finance/project-attributed-cash.service";
import { getProjectProfitabilityReport } from "../reports/project-profitability.service";
import { getProjectIncomeExpenseReport } from "../reports/project-income-expense.service";
import { getOverheadByProjectReport } from "../reports/overhead-by-project.service";
import { createSalesInvoice, issueSalesInvoice } from "./sales-invoice.service";
import { registerArIncome } from "./register-ar-income.service";
import { createSalesCreditNoteFromInvoice, issueSalesCreditNote } from "./credit-debit-note.service";
import { createCollection } from "../treasury/collection.service";
import { getCashFlowReport } from "../treasury-reports/treasury-reports.service";
import { getAutoWeightOverheadPreviewForPeriod, sumAutoWeightOverheadForProject } from "../finance/overhead-auto-weight.service";
import { closeOverheadPeriod, reopenOverheadPeriod } from "../finance/overhead-period-freeze.service";
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
        await tx.supplierInvoice.deleteMany({ where: { tenantId } });
        await tx.subcontractCertificationLine.deleteMany({ where: { certification: { tenantId } } });
        await tx.subcontractCertification.deleteMany({ where: { tenantId } });
        await tx.subcontractLine.deleteMany({ where: { subcontract: { tenantId } } });
        await tx.subcontract.deleteMany({ where: { tenantId } });
        await tx.certification.deleteMany({ where: { tenantId } });
        await tx.budget.deleteMany({ where: { tenantId } });
        await tx.projectOverheadAllocation.deleteMany({ where: { tenantId } });
        await tx.overheadAutoPeriodSnapshot.deleteMany({ where: { tenantId } });
        await tx.overheadPeriodClose.deleteMany({ where: { tenantId } });
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
  it("rejects combining project and corporate aging for an assigned project user", async () => {
    const s = await scope();
    await prisma.projectMembership.create({ data: { tenantId, projectId: s.project.id, userId: pmId } });
    const filter = { projectId: s.project.id, corporateOnly: true };
    const validation = (err: unknown) => err instanceof ServiceError && err.code === "VALIDATION";
    await assert.rejects(() => getReceivableAgingReport(filter, pm), validation);
    await assert.rejects(() => getPayableAgingReport(filter, pm), validation);
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
  it("keeps AR amounts out of cash reports for a project member with AP only", async () => {
    const s = await scope(), r = await invoice(s);
    await cash(r.id);
    await prisma.projectMembership.create({ data: { tenantId, projectId: s.project.id, userId: pmId } });
    const apOnly: ServiceContext = { ...pm, roles: ["PROCUREMENT"] };
    const actual = await getProjectCashFlowReport(s.project.id, { dateFrom: date, dateTo: date }, apOnly);
    assert.ok(actual.warnings.sectionsExcluded?.some((section) => section.module === "AR" && section.reason === "MISSING_PERMISSION"));
    assert.ok(actual.currencies.every((currency) => currency.collections.length === 0 && currency.totalInflows === "0.00"));
    const position = await getProjectCashPositionProjection(s.project.id, { asOfDate: date }, apOnly);
    assert.ok(position.currencies.every((currency) => currency.receivablesDue === "0.00" && currency.collectionsReceived === "0.00"));
    const projection = await getProjectCashProjectionReport(s.project.id, { dateFrom: date, dateTo: date }, apOnly);
    assert.ok(projection.currencies.every((currency) => currency.totalExpectedInflows === "0.00"));
  });
  it("uses the certified invoice net basis with issued notes and excludes direct and other-company sales", async () => {
    const s = await scope();
    const issueDate = new Date(date);
    const budget = await prisma.budget.create({ data: { tenantId, projectId: s.project.id, versionNumber: 1, name: "Principal", status: "APPROVED", currency: "ARS", totalSalePrice: "1000" } });
    const certification = await prisma.certification.create({ data: {
      tenantId, companyId, projectId: s.project.id, budgetId: budget.id, number: 1, periodStart: issueDate, periodEnd: issueDate,
      issueDate, status: "APPROVED", totalAmount: "100",
    } });
    const otherCertification = await prisma.certification.create({ data: {
      tenantId, companyId: companyB, projectId: s.project.id, budgetId: budget.id, number: 2, periodStart: issueDate, periodEnd: issueDate,
      issueDate, status: "APPROVED", totalAmount: "500",
    } });
    const base = { tenantId, companyId, projectId: s.project.id, clientContactId: s.client.id, issueDate, dueDate: issueDate, currency: "ARS", status: "ISSUED" as const };
    const certified = await prisma.salesInvoice.create({ data: {
      ...base, number: 90000, certificationId: certification.id, subtotal: "100", taxAmount: "21", iibbPerceptionAmount: "3", totalAmount: "124",
    } });
    await prisma.salesInvoice.createMany({ data: [
      { ...base, number: 90000, documentKind: "DEBIT_NOTE", referencedSalesInvoiceId: certified.id, subtotal: "20", taxAmount: "4.2", totalAmount: "24.2" },
      { ...base, number: 90000, documentKind: "CREDIT_NOTE", referencedSalesInvoiceId: certified.id, subtotal: "30", taxAmount: "6.3", totalAmount: "36.3" },
      { ...base, number: 90001, status: "DRAFT", documentKind: "DEBIT_NOTE", referencedSalesInvoiceId: certified.id, subtotal: "900", totalAmount: "900" },
      { ...base, number: 90001, subtotal: "250", totalAmount: "250" },
      { ...base, companyId: companyB, number: 90000, certificationId: otherCertification.id, subtotal: "500", totalAmount: "500" },
    ] });
    const result = await getProjectProfitabilityReport(s.project.id, { revenueBasis: "invoiced" }, ctx);
    assert.equal(result.type, "REPORT");
    assert.equal(result.revenue, "90.00");
    assert.equal(result.grossMargin, "90.00");
    assert.equal(result.currency, "ARS");
    const sharedCertification = await prisma.certification.create({ data: {
      tenantId, projectId: s.project.id, budgetId: budget.id, number: 3, periodStart: issueDate, periodEnd: issueDate,
      issueDate, status: "APPROVED", totalAmount: "700",
    } });
    await prisma.salesInvoice.create({ data: {
      ...base, companyId: companyB, number: 90001, certificationId: sharedCertification.id, subtotal: "700", totalAmount: "700",
    } });
    await prisma.budget.update({ where: { id: budget.id }, data: { companyId } });
    const unanchored = await getProjectProfitabilityReport(s.project.id, { revenueBasis: "invoiced" }, global);
    assert.equal(unanchored.type, "REPORT");
    assert.equal(unanchored.revenue, "90.00");
    await assert.rejects(() => getProjectProfitabilityReport(s.project.id, { revenueBasis: "invoiced" }, { ...ctx, roles: ["PROCUREMENT"] }), denied);
    const disabled = await prisma.tenantModuleSetting.create({ data: { tenantId, moduleKey: "AP", isEnabled: false } });
    try {
      const paid = await getProjectProfitabilityReport(s.project.id, { revenueBasis: "invoiced", costLayer: "paid" }, ctx);
      assert.equal(paid.type, "REPORT");
      assert.equal(paid.revenue, "90.00");
      assert.equal(paid.directCost, null);
      assert.equal(paid.grossMargin, null);
      assert.ok(paid.sectionsExcluded.some((section) => section.module === "AP" && section.reason === "TENANT_MODULE_DISABLED"));
    } finally {
      await prisma.tenantModuleSetting.delete({ where: { id: disabled.id } });
    }
  });
  it("reports accrued amounts by native currency and anchors shared-project AP to company", async () => {
    const s = await scope();
    const issueDate = new Date(date);
    const supplier = await prisma.contact.create({ data: { tenantId, legalName: "Synthetic supplier", country: "AR" } });
    const base = { tenantId, companyId, projectId: s.project.id, supplierContactId: supplier.id, issueDate, dueDate: issueDate, status: "ISSUED" as const };
    await prisma.supplierInvoice.createMany({ data: [
      { ...base, number: 90000, currency: "ARS", subtotal: "100", totalAmount: "121" },
      { ...base, number: 90001, currency: "USD", subtotal: "10", totalAmount: "12.1" },
      { ...base, number: 90000, currency: "ARS", subtotal: "200", totalAmount: "242", companyId: companyB },
    ] });
    const report = await getProjectIncomeExpenseReport(s.project.id, { dateFrom: date, dateTo: date }, ctx);
    assert.equal(report.consolidationBlocked, true);
    assert.equal(report.totals.costAccrued, "100.00");
    assert.deepEqual(report.byCurrency.map((slice) => [slice.currency, slice.totals.costAccrued]), [["ARS", "100.00"], ["USD", "10.00"]]);
    assert.equal(report.totals.grossMarginAccrued, null);
    const budget = await prisma.budget.create({ data: { tenantId, projectId: s.project.id, versionNumber: 1, name: "Principal", status: "APPROVED", currency: "ARS" } });
    await prisma.projectMembership.create({ data: { tenantId, projectId: s.project.id, userId: pmId } });
    const apOnly = await getProjectIncomeExpenseReport(s.project.id, { budgetId: budget.id, dateFrom: date, dateTo: date }, { ...pm, roles: ["PROCUREMENT"] });
    assert.equal(apOnly.sourcesAvailable.ar, false);
    assert.equal(apOnly.totals.grossMarginCash, null);
  });
  it("reconciles cash flow when historical movement and account currency spellings differ", async () => {
    const bank = await prisma.treasuryAccount.create({ data: { tenantId, companyId, name: "Synthetic legacy EUR bank", type: "BANK", currency: "eur", openingBalance: "5" } });
    await prisma.accountMovement.create({ data: {
      tenantId, companyId, accountId: bank.id, movementDate: new Date(date), amount: "10", currency: "EUR",
      type: "INFLOW", sourceType: "MANUAL_ADJUSTMENT", description: "Synthetic legacy spelling",
    } });
    const currencies = await getCashFlowReport({ dateFrom: date, dateTo: date, currency: "EUR" }, ctx);
    assert.equal(currencies.length, 1);
    assert.equal(currencies[0]?.currency, "EUR");
    assert.equal(currencies[0]?.openingBalance, "5.00");
    assert.equal(currencies[0]?.closingBalance, "15.00");
  });
  it("restricts the company overhead report to company finance and visible works", async () => {
    const a = await scope(), hidden = await scope(), b = await scope();
    await prisma.projectMembership.createMany({ data: [a, b].map((s) => ({ tenantId, projectId: s.project.id, userId: pmId })) });
    await prisma.projectOverheadAllocation.createMany({ data: [
      { tenantId, companyId, projectId: a.project.id, period: "2026-11", amount: "10" },
      { tenantId, companyId, projectId: hidden.project.id, period: "2026-11", amount: "20" },
      { tenantId, companyId: companyB, projectId: b.project.id, period: "2026-11", amount: "30" },
    ] });
    const scoped = await getOverheadByProjectReport({ ...pm, roles: ["FINANCE"] });
    assert.deepEqual(scoped.rows.map((row) => [row.projectId, row.amount]), [[a.project.id, "10.00"]]);
    const unanchored = await getOverheadByProjectReport(global);
    assert.deepEqual(unanchored.rows.map((row) => row.amount).sort(), ["10.00", "20.00", "30.00"]);
    await assert.rejects(() => getOverheadByProjectReport({ ...pm, roles: ["PROJECT_VIEWER"] }), denied);
  });
  it("weights net costs in verified ARS and preserves a frozen allocation when later evidence lacks FX", async () => {
    const usd = await scope(), ars = await scope();
    const period = "2026-11";
    const issueDate = new Date(date);
    await prisma.company.update({ where: { id: companyId }, data: { overheadAllocationMode: "AUTO_WEIGHT" } });
    await prisma.project.updateMany({ where: { id: { in: [usd.project.id, ars.project.id] } }, data: { companyId } });
    const supplier = await prisma.contact.create({ data: { tenantId, legalName: "Synthetic D-142 supplier", country: "AR" } });
    const base = { tenantId, companyId, supplierContactId: supplier.id, issueDate, dueDate: issueDate, status: "ISSUED" as const };
    const usdInvoice = await prisma.supplierInvoice.create({ data: {
      ...base, projectId: usd.project.id, number: 92000, currency: "USD", subtotal: "100", totalAmount: "121", fxRate: "1250", amountArs: "151250",
    } });
    await prisma.supplierInvoice.createMany({ data: [
      { ...base, projectId: usd.project.id, number: 92000, currency: "USD", documentKind: "DEBIT_NOTE", referencedSupplierInvoiceId: usdInvoice.id, subtotal: "20", totalAmount: "24.2", fxRate: "1250", amountArs: "30250" },
      { ...base, projectId: usd.project.id, number: 92000, currency: "USD", documentKind: "CREDIT_NOTE", referencedSupplierInvoiceId: usdInvoice.id, subtotal: "20", totalAmount: "24.2", fxRate: "1250", amountArs: "30250" },
      { ...base, projectId: ars.project.id, number: 92001, currency: "ARS", subtotal: "100", totalAmount: "121" },
      { ...base, projectId: null, number: 92002, currency: "ARS", subtotal: "125100", totalAmount: "125100" },
    ] });
    const preview = await getAutoWeightOverheadPreviewForPeriod(companyId, period, ctx);
    assert.equal(preview.calculationBlocked, false);
    assert.equal(preview.totalAccruedCd, "125100.00");
    assert.equal(preview.rows.find((row) => row.projectId === usd.project.id)?.allocatedAmount, "125000.00");
    assert.equal(preview.rows.find((row) => row.projectId === ars.project.id)?.allocatedAmount, "100.00");
    await prisma.projectMembership.create({ data: { tenantId, projectId: ars.project.id, userId: pmId } });
    const finance: ServiceContext = { ...pm, roles: ["FINANCE"] };
    const scoped = await getAutoWeightOverheadPreviewForPeriod(companyId, period, finance);
    assert.equal(scoped.totalAccruedCd, "125100.00");
    assert.deepEqual(scoped.rows.map((row) => [row.projectId, row.allocatedAmount]), [[ars.project.id, "100.00"]]);
    await closeOverheadPeriod(companyId, period, finance);

    const subcontract = await prisma.subcontract.create({ data: {
      tenantId, companyId, projectId: usd.project.id, subcontractorContactId: supplier.id, number: 1,
      title: "Synthetic D-142 foreign contract", contractDate: issueDate, currency: "USD", status: "ACTIVE",
    } });
    const line = await prisma.subcontractLine.create({ data: {
      subcontractId: subcontract.id, description: "Synthetic line", unit: "u", quantity: "1", unitPrice: "10", lineTotal: "10",
    } });
    await prisma.subcontractCertification.create({ data: {
      tenantId, companyId, projectId: usd.project.id, subcontractId: subcontract.id, subcontractorContactId: supplier.id,
      number: 1, periodStart: issueDate, periodEnd: issueDate, certificationDate: issueDate, status: "APPROVED",
      lines: { create: { subcontractLineId: line.id, previousQty: "0", currentQty: "1", cumulativeQty: "1", remainingQty: "0", unitPriceSnapshot: "10", lineTotal: "10" } },
    } });
    const frozen = await sumAutoWeightOverheadForProject(usd.project.id, companyId, undefined, ctx);
    assert.equal(frozen.amount?.toFixed(2), "125000.00");
    await reopenOverheadPeriod(companyId, period, ctx);

    const blocked = await getAutoWeightOverheadPreviewForPeriod(companyId, period, ctx);
    assert.equal(blocked.calculationBlocked, true);
    assert.equal(blocked.totalAccruedCd, null);
    assert.ok(blocked.rows.every((row) => row.weightPct === null && row.allocatedAmount === null));
    assert.equal((await sumAutoWeightOverheadForProject(usd.project.id, companyId, undefined, ctx)).amount, null);
    await assert.rejects(() => closeOverheadPeriod(companyId, period, ctx), (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT");
    const closed = await prisma.overheadPeriodClose.findUniqueOrThrow({ where: { tenantId_companyId_period: { tenantId, companyId, period } } });
    assert.equal(closed.status, "OPEN");
    assert.equal(await prisma.overheadAutoPeriodSnapshot.count({ where: { periodCloseId: closed.id } }), 0);

    const originalDate = new Date("2026-09-25");
    const creditDate = new Date("2026-10-01");
    const corporateInvoice = await prisma.supplierInvoice.create({ data: {
      ...base, projectId: null, number: 92003, issueDate: originalDate, dueDate: originalDate, subtotal: "100", totalAmount: "100",
    } });
    await prisma.supplierInvoice.create({ data: {
      ...base, projectId: null, number: 92001, issueDate: creditDate, dueDate: creditDate,
      documentKind: "CREDIT_NOTE", referencedSupplierInvoiceId: corporateInvoice.id, subtotal: "100", totalAmount: "100",
    } });
    const negativePool = await getAutoWeightOverheadPreviewForPeriod(companyId, "2026-10", ctx);
    assert.equal(negativePool.poolArs, "-100.00");
    assert.equal(negativePool.totalAccruedCd, "0.00");
    assert.equal(negativePool.calculationBlocked, true);
    await assert.rejects(() => closeOverheadPeriod(companyId, "2026-10", ctx), { code: "CONFLICT" });
  });
});
