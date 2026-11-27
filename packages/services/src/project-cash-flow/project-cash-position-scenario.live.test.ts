/** D-150 regression: maintained fixtures in an explicitly disposable SQL database only. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { prisma, type Prisma } from "@bloqer/database";
import { toIsoDateInTimeZone } from "@bloqer/utils";
import { clearProjectAccessModeCache } from "../security/access";
import { assertAuditDatabaseIdentity } from "../testing/audit-fixture";
import { ServiceError, type ServiceContext } from "../types";
import { getProjectCashPositionProjection, getProjectCashPositionProjectionContext } from "./project-cash-position-projection.service";

const denied = (error: unknown) => error instanceof ServiceError && ["FORBIDDEN", "NOT_FOUND", "MODULE_DISABLED"].includes(error.code);

describe("D-150 project collection delay scenario", { skip: process.env.BLOQER_AUDIT_LIVE !== "1", concurrency: false }, () => {
  const tenantId = randomUUID(), foreignTenantId = randomUUID();
  const companyId = randomUUID(), companyB = randomUUID(), foreignCompanyId = randomUUID();
  const projectId = randomUUID(), otherProjectId = randomUUID(), foreignProjectId = randomUUID();
  const actorId = randomUUID(), pmId = randomUUID(), clientId = randomUUID(), foreignClientId = randomUUID();
  const timeZone = "America/Argentina/Buenos_Aires";
  const today = toIsoDateInTimeZone(new Date(), timeZone);
  const ctx: ServiceContext = { tenantId, companyId, actorUserId: actorId, roles: ["OWNER"] };
  const pm: ServiceContext = { ...ctx, actorUserId: pmId, roles: ["PROJECT_MANAGER"] };
  const tenantIds = [tenantId, foreignTenantId];
  let verified = false;
  let invoiceNumber = 0;

  function date(offset: number) {
    const value = new Date(`${today}T00:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() + offset);
    return value;
  }
  const iso = (offset: number) => date(offset).toISOString().slice(0, 10);

  async function receivable(tx: Prisma.TransactionClient, options: {
    companyId?: string; projectId?: string; tenantId?: string; clientId?: string;
    currency?: string; due: number; amount: string; paid?: string; credited?: string;
    status?: "OPEN" | "PARTIAL" | "OVERDUE" | "PAID" | "CANCELLED";
  }) {
    const common = {
      tenantId: options.tenantId ?? tenantId, companyId: options.companyId ?? companyId,
      projectId: options.projectId ?? projectId, clientContactId: options.clientId ?? clientId,
      issueDate: date(-30), dueDate: date(options.due), currency: options.currency ?? "ARS",
    };
    const invoice = await tx.salesInvoice.create({ data: {
      ...common, number: ++invoiceNumber, status: "ISSUED", invoiceLetter: "C",
      subtotal: options.amount, totalAmount: options.amount,
    } });
    return tx.receivable.create({ data: {
      ...common, salesInvoiceId: invoice.id, originalAmount: options.amount,
      paidAmount: options.paid ?? "0", creditedAmount: options.credited ?? "0",
      status: options.status ?? "OPEN",
    } });
  }

  before(async () => {
    await assertAuditDatabaseIdentity(prisma);
    verified = true;
    clearProjectAccessModeCache();
    await prisma.$transaction(async (tx) => {
      await tx.tenant.createMany({ data: tenantIds.map((id) => ({
        id, name: "Synthetic D-150", slug: `audit-delay-${id}`, timezone: timeZone,
        projectAccessMode: "MEMBERSHIP_SCOPED" as const,
      })) });
      await tx.company.createMany({ data: [
        { id: companyId, tenantId, name: "D-150 A", country: "AR" },
        { id: companyB, tenantId, name: "D-150 B", country: "AR" },
        { id: foreignCompanyId, tenantId: foreignTenantId, name: "D-150 foreign", country: "AR" },
      ] });
      await tx.user.createMany({ data: [actorId, pmId].map((id) => ({ id, email: `audit-delay-${id}@example.test` })) });
      await tx.userMembership.createMany({ data: [
        { tenantId, companyId, userId: actorId, roles: ["OWNER"] },
        { tenantId, companyId, userId: pmId, roles: ["PROJECT_MANAGER"] },
      ] });
      await tx.contact.createMany({ data: [
        { id: clientId, tenantId, legalName: "D-150 local contact", country: "AR" },
        { id: foreignClientId, tenantId: foreignTenantId, legalName: "D-150 foreign contact", country: "AR" },
      ] });
      await tx.project.createMany({ data: [
        { id: projectId, tenantId, companyId: null, clientContactId: clientId, code: "DELAY-SHARED", name: "D-150 shared", country: "AR", status: "ACTIVE" },
        { id: otherProjectId, tenantId, companyId, clientContactId: clientId, code: "DELAY-OTHER", name: "D-150 other", country: "AR", status: "ACTIVE" },
        { id: foreignProjectId, tenantId: foreignTenantId, companyId: foreignCompanyId, clientContactId: foreignClientId, code: "DELAY-FOREIGN", name: "D-150 foreign", country: "AR", status: "ACTIVE" },
      ] });
      const overdue = await receivable(tx, { due: -20, amount: "100", paid: "20", credited: "30", status: "PARTIAL" });
      await receivable(tx, { due: 3, amount: "200" });
      await receivable(tx, { due: 11, amount: "300" });
      await receivable(tx, { due: -10, amount: "12", credited: "5", currency: "USD", status: "OVERDUE" });
      await receivable(tx, { due: -10, amount: "800", status: "CANCELLED" });
      await receivable(tx, { due: -10, amount: "600", paid: "600", status: "PAID" });
      await receivable(tx, { due: -10, amount: "900", companyId: companyB });
      await receivable(tx, { due: -10, amount: "888", projectId: otherProjectId });
      await receivable(tx, { due: -10, amount: "777", tenantId: foreignTenantId, companyId: foreignCompanyId, projectId: foreignProjectId, clientId: foreignClientId });
      const account = await tx.treasuryAccount.create({ data: { tenantId, companyId, name: "D-150 account", type: "BANK", currency: "ARS" } });
      const cash = { tenantId, companyId, projectId, clientContactId: clientId, receivableId: overdue.id, salesInvoiceId: overdue.salesInvoiceId, accountId: account.id, currency: "ARS" };
      await tx.collection.createMany({ data: [
        { ...cash, collectionDate: date(-1), amount: "20", status: "CONFIRMED" },
        { ...cash, collectionDate: date(-1), amount: "500", status: "CANCELLED" },
        { ...cash, collectionDate: date(12), amount: "10", status: "CONFIRMED" },
      ] });
      const common = { tenantId, companyId, projectId, supplierContactId: clientId, issueDate: date(-30), dueDate: date(-1), currency: "ARS" };
      const supplierInvoice = await tx.supplierInvoice.create({ data: { ...common, number: 1, status: "ISSUED", subtotal: "40", totalAmount: "40" } });
      const payable = await tx.payable.create({ data: { ...common, supplierInvoiceId: supplierInvoice.id, originalAmount: "40", paidAmount: "10", creditedAmount: "5", status: "PARTIAL" } });
      await tx.payment.create({ data: { tenantId, companyId, projectId, supplierContactId: clientId, payableId: payable.id, supplierInvoiceId: supplierInvoice.id, accountId: account.id, paymentDate: date(-1), currency: "ARS", amount: "10", status: "CONFIRMED" } });
    }, { timeout: 30_000 });
  });

  after(async () => {
    clearProjectAccessModeCache();
    if (!verified) return;
    try {
      await prisma.$transaction(async (tx) => {
        const where = { tenantId: { in: tenantIds } };
        await tx.collection.deleteMany({ where });
        await tx.payment.deleteMany({ where });
        await tx.receivable.deleteMany({ where });
        await tx.payable.deleteMany({ where });
        await tx.salesInvoice.deleteMany({ where });
        await tx.supplierInvoice.deleteMany({ where });
        await tx.auditLog.deleteMany({ where });
        await tx.projectMembership.deleteMany({ where });
        await tx.project.deleteMany({ where });
        await tx.treasuryAccount.deleteMany({ where });
        await tx.contact.deleteMany({ where });
        await tx.userMembership.deleteMany({ where });
        await tx.tenantModuleSetting.deleteMany({ where });
        await tx.company.deleteMany({ where });
        await tx.tenant.deleteMany({ where: { id: { in: tenantIds } } });
        await tx.user.deleteMany({ where: { id: { in: [actorId, pmId] } } });
      }, { timeout: 30_000 });
    } finally { await prisma.$disconnect(); }
  });

  const filters = { asOfDate: iso(7), collectionDelayDays: "5" };
  async function snapshot() {
    const where = { tenantId }, orderBy = { id: "asc" as const };
    return JSON.stringify(await Promise.all([
      prisma.receivable.findMany({ where, orderBy }), prisma.payable.findMany({ where, orderBy }),
      prisma.collection.findMany({ where, orderBy }), prisma.payment.findMany({ where, orderBy }),
      prisma.salesInvoice.findMany({ where, orderBy }), prisma.supplierInvoice.findMany({ where, orderBy }),
      prisma.auditLog.count({ where }),
    ]));
  }

  it("compares net balances by currency without writing documents, dates, cash or audit events", async () => {
    const beforeRead = await snapshot();
    const report = await getProjectCashPositionProjection(projectId, filters, ctx);
    assert.equal(report.context.today, today);
    assert.equal(report.context.timeZone, timeZone);
    assert.equal(report.collectionDelayDays, 5);
    assert.equal(report.scenarioError, null);
    assert.deepEqual(report.currencies.map((row) => row.currency), ["ARS", "USD"]);
    const ars = report.currencies[0]!;
    assert.equal(ars.collectionsReceived, "20.00");
    assert.equal(ars.paymentsMade, "10.00");
    assert.equal(ars.receivablesDue, "250.00");
    assert.equal(ars.payablesDue, "25.00");
    assert.equal(ars.projectedCapital, "235.00");
    assert.equal(ars.receivableOpenCount, 2);
    assert.deepEqual(ars.scenario, { receivablesDue: "50.00", projectedCapital: "35.00", capitalDifference: "-200.00", deferredReceivables: "200.00", deferredReceivableCount: 1 });
    assert.equal(report.currencies[1]!.scenario!.projectedCapital, "7.00");
    assert.equal(await snapshot(), beforeRead);
  });

  it("zero reproduces the base and overdue balances shift from today, including the boundary day", async () => {
    const zero = await getProjectCashPositionProjection(projectId, { ...filters, collectionDelayDays: 0 }, ctx);
    for (const row of zero.currencies) {
      assert.equal(row.scenario!.projectedCapital, row.projectedCapital);
      assert.equal(row.scenario!.capitalDifference, "0.00");
    }
    const boundary = await getProjectCashPositionProjection(projectId, { asOfDate: iso(5), collectionDelayDays: 5, currency: "ARS" }, ctx);
    assert.equal(boundary.currencies[0]!.scenario!.receivablesDue, "50.00");
    const cutoff = await getProjectCashPositionProjection(projectId, { asOfDate: today, collectionDelayDays: 1, currency: "ARS" }, ctx);
    assert.equal(cutoff.currencies[0]!.scenario!.receivablesDue, "0.00");
    assert.equal(cutoff.currencies[0]!.scenario!.capitalDifference, "-50.00");
  });

  it("anchors shared-project rows to company, excludes other works/tenants and preserves explicit currency", async () => {
    const b = await getProjectCashPositionProjection(projectId, filters, { ...ctx, companyId: companyB });
    assert.equal(b.currencies[0]!.projectedCapital, "900.00");
    const global = await getProjectCashPositionProjection(projectId, filters, { ...ctx, companyId: null });
    assert.equal(global.currencies[0]!.projectedCapital, "1135.00");
    assert.equal(global.currencies[0]!.scenario!.projectedCapital, "935.00");
    const usd = await getProjectCashPositionProjection(projectId, { ...filters, currency: "USD" }, ctx);
    assert.deepEqual(usd.currencies.map((row) => row.currency), ["USD"]);
    const empty = await getProjectCashPositionProjection(projectId, { ...filters, currency: "EUR" }, ctx);
    assert.equal(empty.currencies[0]!.scenario!.projectedCapital, "0.00");
  });

  it("checks project access before both context and monetary reads", async () => {
    await assert.rejects(() => getProjectCashPositionProjection(foreignProjectId, filters, ctx), denied);
    await assert.rejects(() => getProjectCashPositionProjectionContext(foreignProjectId, ctx), denied);
    await assert.rejects(() => getProjectCashPositionProjection(projectId, filters, pm), denied);
    await assert.rejects(() => getProjectCashPositionProjectionContext(projectId, pm), denied);
    await assert.rejects(() => getProjectCashPositionProjection(projectId, filters, { ...ctx, roles: [] }), denied);
    const membership = await prisma.projectMembership.create({ data: { tenantId, projectId, userId: pmId } });
    clearProjectAccessModeCache();
    try {
      const report = await getProjectCashPositionProjection(projectId, filters, pm);
      assert.equal(report.currencies[0]!.scenario!.projectedCapital, "35.00");
    } finally {
      await prisma.projectMembership.delete({ where: { id: membership.id } });
      clearProjectAccessModeCache();
    }
  });

  it("never supplies a scenario or AR values to an AP-only role", async () => {
    const membership = await prisma.projectMembership.create({ data: { tenantId, projectId, userId: pmId } });
    clearProjectAccessModeCache();
    try {
      const report = await getProjectCashPositionProjection(projectId, filters, { ...pm, roles: ["PROCUREMENT"] });
      assert.equal(report.context.receivablesAvailable, false);
      assert.equal(report.collectionDelayDays, null);
      assert.ok(report.scenarioError);
      assert.ok(report.currencies.every((row) => row.receivablesDue === "0.00" && row.collectionsReceived === "0.00" && row.scenario === null));
    } finally {
      await prisma.projectMembership.delete({ where: { id: membership.id } });
      clearProjectAccessModeCache();
    }
  });

  it("respects AR, AP and PROJECTS module gates and marks an AP-excluded comparison", async () => {
    for (const moduleKey of ["AR", "AP", "PROJECTS"] as const) {
      const setting = await prisma.tenantModuleSetting.create({ data: { tenantId, moduleKey, isEnabled: false } });
      try {
        if (moduleKey === "PROJECTS") {
          await assert.rejects(() => getProjectCashPositionProjection(projectId, filters, ctx), denied);
          await assert.rejects(() => getProjectCashPositionProjectionContext(projectId, ctx), denied);
          continue;
        }
        const report = await getProjectCashPositionProjection(projectId, filters, ctx);
        assert.ok(report.sectionsExcluded.some((section) => section.module === moduleKey && section.reason === "TENANT_MODULE_DISABLED"));
        if (moduleKey === "AR") {
          assert.ok(report.scenarioError);
          assert.ok(report.currencies.every((row) => row.scenario === null && row.receivablesDue === "0.00"));
        } else {
          assert.equal(report.context.payablesAvailable, false);
          assert.equal(report.currencies[0]!.scenario!.projectedCapital, "70.00");
        }
      } finally { await prisma.tenantModuleSetting.delete({ where: { id: setting.id } }); }
    }
  });

  it("invalid delay or historical scenario returns a visible error and a usable base", async () => {
    for (const collectionDelayDays of ["-1", "1.5", "3651", "NaN"]) {
      const report = await getProjectCashPositionProjection(projectId, { ...filters, collectionDelayDays }, ctx);
      assert.ok(report.scenarioError);
      assert.equal(report.currencies[0]!.projectedCapital, "235.00");
      assert.equal(report.currencies[0]!.scenario, null);
    }
    for (const asOfDate of [iso(-1), "2026-02-30"]) {
      const report = await getProjectCashPositionProjection(projectId, { ...filters, asOfDate }, ctx);
      assert.ok(report.scenarioError);
      assert.ok(report.currencies.every((row) => row.scenario === null));
    }
  });
});
