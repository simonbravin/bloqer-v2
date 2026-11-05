import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { hash } from "bcryptjs";

import { prisma } from "@bloqer/database";

import { clearProjectAccessModeCache } from "../security/access";
import { assertAuditDatabaseIdentity } from "../testing/audit-fixture";
import { ServiceError, type ServiceContext } from "../types";
import { getCertificationEvolutionReport } from "./certification-evolution.service";
import { getMultiProjectProcurementReport, getProcurementDeviationReport } from "./procurement-deviation.service";
import { getProjectSupplierReport } from "./project-supplier-report.service";
import { getPurchaseOrderVarianceReport } from "./purchase-order-variance-report.service";
import { getSubcontractVarianceReport } from "./subcontract-variance.service";

const denied = (error: unknown) => error instanceof ServiceError && error.code === "FORBIDDEN";
const invalid = (error: unknown) => error instanceof ServiceError && error.code === "VALIDATION";

describe("AG-12 operational reports on isolated SQL", {
  skip: process.env.BLOQER_AUDIT_LIVE !== "1",
  concurrency: false,
}, () => {
  const tenantId = randomUUID();
  const companyA = randomUUID();
  const companyB = randomUUID();
  const shared = randomUUID();
  const hidden = randomUUID();
  const supplierId = randomUUID();
  const otherSupplierId = randomUUID();
  const budgetA = randomUUID();
  const budgetB = randomUUID();
  const wbs = randomUUID();
  const actor = randomUUID();
  const reader = randomUUID();
  const warehouseActor = randomUUID();
  const owner = randomUUID();
  const ctx: ServiceContext = { tenantId, companyId: companyA, actorUserId: actor, roles: ["PROJECT_MANAGER"] };
  const viewOnly: ServiceContext = { ...ctx, actorUserId: reader, roles: ["PROJECT_VIEWER"] };
  const warehouse: ServiceContext = { ...ctx, actorUserId: warehouseActor, roles: ["WAREHOUSE"] };
  const admin: ServiceContext = { ...ctx, actorUserId: owner, roles: ["OWNER"] };
  const nov = new Date("2026-11-02T00:00:00.000Z");
  const oct = new Date("2026-10-03T00:00:00.000Z");
  const retain = process.env.BLOQER_AUDIT_RETAIN_FIXTURES === "1";
  const emailFor = (userId: string) => `ag12-operational-${userId}@example.test`;
  let verified = false;

  before(async () => {
    await assertAuditDatabaseIdentity(prisma);
    verified = true;
    clearProjectAccessModeCache();
    const passwordHash = retain ? await hash("audit-ag12-local-only", 10) : null;
    await prisma.$transaction(async (tx) => {
      await tx.tenant.create({ data: {
        id: tenantId, name: "Reportes de prueba AG-12", slug: `audit-ag12-operational-${tenantId}`,
        projectAccessMode: "MEMBERSHIP_SCOPED",
      } });
      await tx.company.createMany({ data: [
        { id: companyA, tenantId, name: "Empresa A" }, { id: companyB, tenantId, name: "Empresa B" },
      ] });
      const contexts = [ctx, viewOnly, warehouse, admin];
      await tx.user.createMany({ data: contexts.map(({ actorUserId }) => ({
        id: actorUserId, email: emailFor(actorUserId), status: "ACTIVE", passwordHash, emailVerified: new Date(),
      })) });
      await tx.userMembership.createMany({ data: contexts.map(({ actorUserId, roles }) => ({
        tenantId, companyId: companyA, userId: actorUserId, roles, status: "ACTIVE",
      })) });
      await tx.contact.createMany({ data: [
        { id: supplierId, tenantId, legalName: "Proveedor de prueba" },
        { id: otherSupplierId, tenantId, legalName: "Proveedor ajeno" },
      ] });
      await tx.contactRole.createMany({ data: [
        { tenantId, contactId: supplierId, role: "CLIENT" },
        { tenantId, contactId: supplierId, role: "SUPPLIER" },
        { tenantId, contactId: otherSupplierId, role: "SUPPLIER" },
      ] });
      await tx.project.createMany({ data: [
        { id: shared, companyId: null, code: "AG12-01", name: "Obra compartida AG-12" },
        { id: hidden, companyId: companyA, code: "AG12-02", name: "Obra no asignada AG-12" },
      ].map((project) => ({ ...project, tenantId, clientContactId: supplierId, country: "AR", status: "ACTIVE" })) });
      await tx.projectMembership.createMany({ data: [actor, reader, warehouseActor].map((userId) => ({
        tenantId, projectId: shared, userId,
      })) });
      await tx.budget.createMany({ data: [
        { id: budgetA, companyId: companyA, versionNumber: 1, name: "Presupuesto de prueba", status: "APPROVED" as const },
        { id: budgetB, companyId: companyB, versionNumber: 2, name: "Presupuesto ajeno", status: "CLOSED" as const },
      ].map((budget) => ({ ...budget, tenantId, projectId: shared, currency: "ARS", totalSalePrice: "1000.00" })) });
      await tx.wbsNode.create({ data: { id: wbs, budgetId: budgetA, type: "ITEM", code: "1", name: "Frente de prueba" } });
      await tx.costItem.create({ data: { budgetId: budgetA, wbsNodeId: wbs, quantity: "10", unit: "m2", totalSalePrice: "1000" } });
      for (const order of [
        { companyId: companyA, projectId: shared, number: 1, currency: "ARS", issueDate: nov, subtotal: "200", supplierContactId: supplierId },
        { companyId: companyA, projectId: shared, number: 2, currency: "USD", issueDate: oct, subtotal: "10", supplierContactId: supplierId },
        { companyId: companyB, projectId: shared, number: 3, currency: "ARS", issueDate: nov, subtotal: "700", supplierContactId: otherSupplierId },
        { companyId: companyA, projectId: hidden, number: 4, currency: "ARS", issueDate: nov, subtotal: "900", supplierContactId: otherSupplierId },
      ]) {
        await tx.purchaseOrder.create({ data: {
          ...order, tenantId, totalAmount: order.subtotal, status: "CONFIRMED",
          lines: { create: { description: "Material de prueba", quantity: "1", unitPrice: order.subtotal,
            lineSubtotal: order.subtotal, lineTotal: order.subtotal,
            varianceTier: "NO_BUDGET_BASELINE",
            wbsNodeId: order.number === 1 || order.number === 2 ? wbs : null,
          } },
        } });
      }
      const cert = await tx.certification.create({ data: {
        tenantId, companyId: companyA, projectId: shared, budgetId: budgetA, number: 1, periodStart: oct,
        periodEnd: oct, status: "APPROVED", totalAmount: "100.00",
      } });
      await tx.certification.create({ data: {
        tenantId, companyId: companyB, projectId: shared, budgetId: budgetA, number: 2, periodStart: oct,
        periodEnd: oct, status: "APPROVED", totalAmount: "700.00",
      } });
      const invoice = await tx.salesInvoice.create({ data: {
        tenantId, companyId: companyA, projectId: shared, clientContactId: supplierId, certificationId: cert.id,
        number: 1, issueDate: nov, dueDate: nov, subtotal: "100", taxAmount: "21", totalAmount: "121",
        currency: "ARS", status: "ISSUED",
      } });
      await tx.receivable.create({ data: {
        tenantId, companyId: companyA, projectId: shared, clientContactId: supplierId, salesInvoiceId: invoice.id,
        issueDate: nov, dueDate: nov, originalAmount: "121", creditedAmount: "121", currency: "ARS", status: "PAID",
      } });
      await tx.supplierInvoice.create({ data: {
        tenantId, companyId: companyA, projectId: shared, supplierContactId: supplierId,
        number: 1, issueDate: nov, dueDate: nov, subtotal: "40", taxAmount: "0", totalAmount: "40",
        currency: "ARS", status: "ISSUED",
      } });
    }, { timeout: 45_000 });
    if (retain) console.info(JSON.stringify({ projectId: shared, ownerEmail: emailFor(owner), readerEmail: emailFor(reader) }));
  });

  after(async () => {
    if (!verified) return;
    try {
      if (retain) return;
      await prisma.$transaction(async (tx) => {
        await tx.receivable.deleteMany({ where: { tenantId } });
        await tx.salesInvoice.deleteMany({ where: { tenantId } });
        await tx.supplierInvoice.deleteMany({ where: { tenantId } });
        await tx.certification.deleteMany({ where: { tenantId } });
        await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrder: { tenantId } } });
        await tx.purchaseOrder.deleteMany({ where: { tenantId } });
        await tx.costItem.deleteMany({ where: { budgetId: budgetA } });
        await tx.wbsNode.deleteMany({ where: { budgetId: budgetA } });
        await tx.budget.deleteMany({ where: { tenantId } });
        await tx.projectMembership.deleteMany({ where: { tenantId } });
        await tx.project.deleteMany({ where: { tenantId } });
        await tx.contactRole.deleteMany({ where: { tenantId } });
        await tx.contact.deleteMany({ where: { tenantId } });
        await tx.userMembership.deleteMany({ where: { tenantId } });
        await tx.company.deleteMany({ where: { tenantId } });
        await tx.tenant.deleteMany({ where: { id: tenantId } });
        await tx.user.deleteMany({ where: { id: { in: [actor, reader, warehouseActor, owner] } } });
      }, { timeout: 45_000 });
    } finally {
      clearProjectAccessModeCache();
      await prisma.$disconnect();
    }
  });

  it("groups multi-project procurement by currency and intersects company and assigned projects", async () => {
    const report = await getMultiProjectProcurementReport(ctx);
    assert.deepEqual(report.topSuppliers.map(({ currency, committedCost }) => ({ currency, committedCost })), [
      { currency: "ARS", committedCost: "200.00" },
      { currency: "USD", committedCost: "10.00" },
    ]);
    assert.deepEqual(report.openPurchaseOrders.map((row) => row.poNumber), ["OC-1", "OC-2"]);
    await assert.rejects(getMultiProjectProcurementReport(viewOnly), denied);
    await assert.rejects(getPurchaseOrderVarianceReport(hidden, ctx), denied);
  });

  it("applies the purchase date filter before comparing the budget and rejects a mixed basis", async () => {
    const filtered = await getProcurementDeviationReport(shared, { dateFrom: "2026-11-01", dateTo: "2026-11-30" }, ctx);
    assert.equal(filtered.type, "REPORT");
    if (filtered.type !== "REPORT") return;
    assert.equal(filtered.currency, "ARS");
    assert.equal(filtered.byWbs[0]?.committedCost, "200.00");
    assert.equal(filtered.bySupplier[0]?.accruedCost, "40.00");
    assert.equal(filtered.bySupplier[0]?.openCommitted, "200.00");
    const historical = await getPurchaseOrderVarianceReport(shared, ctx, { dateFrom: "2026-11-01" });
    assert.deepEqual(historical.rows.map((row) => [row.purchaseOrderCode, row.currency]), [["OC-001", "ARS"]]);
    await assert.rejects(getProcurementDeviationReport(shared, {}, ctx), invalid);
    await assert.rejects(getProcurementDeviationReport(shared, { dateFrom: "2026-02-30" }, ctx), invalid);
    await assert.rejects(getProcurementDeviationReport(shared, {}, viewOnly), denied);
  });

  it("keeps the supplier slice and rankings in the selected currency, with AP inaccessible for Warehouse", async () => {
    const report = await getProjectSupplierReport(shared, { currency: "USD" }, warehouse);
    assert.equal(report.currency, "USD");
    assert.deepEqual(report.availableCurrencies, ["ARS", "USD"]);
    assert.equal(report.apAvailable, false);
    assert.equal(report.totals.committedCost, "10.00");
    assert.equal(report.totals.supplierCount, 1);
    const defaults = await getProjectSupplierReport(shared, {}, ctx);
    assert.equal(defaults.currency, "ARS");
    assert.equal(defaults.totals.committedCost, "200.00");
    const subcontracts = await getSubcontractVarianceReport(shared, {}, viewOnly);
    assert.equal(subcontracts.type, "REPORT");
    if (subcontracts.type === "REPORT") assert.equal(subcontracts.apAvailable, false);
    await assert.rejects(getSubcontractVarianceReport(hidden, {}, viewOnly), denied);
  });

  it("retains certification metrics but suppresses billing and collections without AR access", async () => {
    const report = await getCertificationEvolutionReport(shared, {}, viewOnly);
    assert.equal(report.type, "REPORT");
    if (report.type !== "REPORT") return;
    assert.equal(report.arAvailable, false);
    assert.equal(report.portfolio[0]?.totalAmount, "100.00");
    assert.equal(report.portfolio[0]?.invoicedAmount, null);
    assert.equal(report.portfolio[0]?.paymentStatus, null);
    assert.equal(report.monthlySeries[0]?.collectedAmount, null);
    assert.equal(report.progressSeries[0]?.financialPct, null);
    assert.equal((await getCertificationEvolutionReport(shared, { budgetId: budgetB }, admin)).type, "NO_APPROVED_BUDGETS");
  });

  it("reconciles invoice date and credit settlement without counting the credit as collected cash", async () => {
    const report = await getCertificationEvolutionReport(shared, { budgetId: budgetA }, { ...admin, companyId: null });
    assert.equal(report.type, "REPORT");
    if (report.type !== "REPORT") return;
    assert.equal(report.arAvailable, true);
    assert.equal(report.currency, "ARS");
    assert.deepEqual(report.monthlySeries.map(({ periodKey, certifiedAmount, invoicedAmount }) =>
      [periodKey, certifiedAmount, invoicedAmount]), [
      ["2026-10", "100.00", "0.00"], ["2026-11", "0.00", "121.00"],
    ]);
    assert.equal(report.portfolio[0]?.paymentStatus, "PAID");
    assert.equal(report.portfolio[0]?.collectedAmount, "0.00");
  });
});
