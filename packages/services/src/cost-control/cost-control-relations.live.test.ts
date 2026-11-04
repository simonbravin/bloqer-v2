/** Real SQL checks for the additional relations of cost-control source documents. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { Prisma, prisma } from "@bloqer/database";
import { assertAuditDatabaseIdentity } from "../testing/audit-fixture";
import { clearProjectAccessModeCache } from "../security/access";
import { ServiceError, type ServiceContext } from "../types";
import { getProjectCostControl, getWbsItemCostDetail } from "./cost-control.service";

const live = process.env.BLOQER_AUDIT_LIVE === "1";
const conflict = (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT";

describe("AG-05 cost sources: SQL relations, APU identity and document scope", { skip: !live, concurrency: false }, () => {
  const tenantId = randomUUID(), otherTenantId = randomUUID(), companyId = randomUUID(), otherCompanyId = randomUUID(), foreignCompanyId = randomUUID();
  const actorUserId = randomUUID(), contactId = randomUUID(), foreignContactId = randomUUID(), accountId = randomUUID();
  const ctx: ServiceContext = { tenantId, companyId, actorUserId, roles: ["OWNER"] };
  const date = new Date("2026-11-04T00:00:00Z"), olderDate = new Date("2026-10-01T00:00:00Z");
  const tenants = [tenantId, otherTenantId];
  let verified = false, number = 0;
  let foreign: Scope;

  before(async () => {
    await assertAuditDatabaseIdentity(prisma); verified = true; clearProjectAccessModeCache();
    await prisma.$transaction(async (tx) => {
      await tx.tenant.createMany({ data: tenants.map((id) => ({ id, name: "Synthetic AG05 graph", slug: `audit-cost-graph-${id}` })) });
      await tx.company.createMany({ data: [{ id: companyId, tenantId, name: "Synthetic graph company" }, { id: otherCompanyId, tenantId, name: "Other graph company" }, { id: foreignCompanyId, tenantId: otherTenantId, name: "Foreign graph company" }] });
      await tx.user.create({ data: { id: actorUserId, email: `audit-graph-${actorUserId}@example.test`, status: "ACTIVE" } });
      await tx.userMembership.create({ data: { userId: actorUserId, tenantId, companyId, roles: ["OWNER"] } });
      await tx.contact.createMany({ data: [{ id: contactId, tenantId, legalName: "Synthetic graph counterparty" }, { id: foreignContactId, tenantId: otherTenantId, legalName: "Foreign graph counterparty" }] });
      await tx.contactRole.createMany({ data: [{ tenantId, contactId, role: "CLIENT" }, { tenantId, contactId, role: "SUPPLIER" }, { tenantId: otherTenantId, contactId: foreignContactId, role: "CLIENT" }, { tenantId: otherTenantId, contactId: foreignContactId, role: "SUPPLIER" }] });
      await tx.contactRole.createMany({ data: [{ tenantId, contactId, role: "SUBCONTRACTOR" }, { tenantId: otherTenantId, contactId: foreignContactId, role: "SUBCONTRACTOR" }] });
      await tx.treasuryAccount.create({ data: { id: accountId, tenantId, companyId, name: "Synthetic graph account", type: "CASH", currency: "ARS" } });
    }, { timeout: 30_000 });
    foreign = await scope({ tenant: otherTenantId, company: foreignCompanyId, contact: foreignContactId });
  });

  after(async () => {
    clearProjectAccessModeCache(); if (!verified) return;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.payment.deleteMany({ where: { tenantId: { in: tenants } } });
        await tx.payable.deleteMany({ where: { tenantId: { in: tenants } } });
        await tx.supplierInvoiceLine.deleteMany({ where: { invoice: { tenantId: { in: tenants } } } });
        await tx.supplierInvoice.deleteMany({ where: { tenantId: { in: tenants }, documentKind: { not: "INVOICE" } } });
        await tx.supplierInvoice.deleteMany({ where: { tenantId: { in: tenants } } });
        await tx.purchaseReceiptLine.deleteMany({ where: { purchaseReceipt: { tenantId: { in: tenants } } } });
        await tx.purchaseReceipt.deleteMany({ where: { tenantId: { in: tenants } } });
        await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrder: { tenantId: { in: tenants } } } });
        await tx.purchaseOrder.deleteMany({ where: { tenantId: { in: tenants } } });
        await tx.subcontractCertificationLine.deleteMany({ where: { certification: { tenantId: { in: tenants } } } });
        await tx.subcontractCertification.deleteMany({ where: { tenantId: { in: tenants } } });
        await tx.subcontractLine.deleteMany({ where: { subcontract: { tenantId: { in: tenants } } } });
        await tx.subcontract.deleteMany({ where: { tenantId: { in: tenants } } });
        await tx.costAnalysisLine.deleteMany({ where: { budget: { tenantId: { in: tenants } } } });
        await tx.costItem.deleteMany({ where: { budget: { tenantId: { in: tenants } } } });
        await tx.wbsNode.deleteMany({ where: { budget: { tenantId: { in: tenants } } } });
        await tx.budget.deleteMany({ where: { tenantId: { in: tenants } } });
        await tx.projectMembership.deleteMany({ where: { tenantId: { in: tenants } } });
        await tx.project.deleteMany({ where: { tenantId: { in: tenants } } });
        await tx.treasuryAccount.deleteMany({ where: { tenantId: { in: tenants } } });
        await tx.contactRole.deleteMany({ where: { tenantId: { in: tenants } } });
        await tx.contact.deleteMany({ where: { tenantId: { in: tenants } } });
        await tx.userMembership.deleteMany({ where: { tenantId: { in: tenants } } });
        await tx.tenantModuleSetting.deleteMany({ where: { tenantId: { in: tenants } } });
        await tx.company.deleteMany({ where: { tenantId: { in: tenants } } });
        await tx.tenant.deleteMany({ where: { id: { in: tenants } } });
        await tx.user.deleteMany({ where: { id: actorUserId } });
      }, { timeout: 30_000 });
    } finally { await prisma.$disconnect(); }
  });

  async function scope(options: { tenant?: string; company?: string | null; contact?: string } = {}) {
    const ownerTenant = options.tenant ?? tenantId, ownerCompany = options.company === undefined ? companyId : options.company, counterparty = options.contact ?? contactId;
    const project = await prisma.project.create({ data: { tenantId: ownerTenant, companyId: null, clientContactId: counterparty, code: randomUUID(), name: "Synthetic graph project", country: "AR", status: "ACTIVE" } });
    const budget = await prisma.budget.create({ data: { tenantId: ownerTenant, companyId: ownerCompany, projectId: project.id, name: "Synthetic graph budget", versionNumber: 1, status: "APPROVED" } });
    const node = await prisma.wbsNode.create({ data: { budgetId: budget.id, code: "1", name: "Synthetic graph WBS", type: "ITEM" } });
    const item = await prisma.costItem.create({ data: { budgetId: budget.id, wbsNodeId: node.id, unit: "un", quantity: 1, totalCostDirect: 100, unitCostDirect: 100 } });
    const material = await prisma.costAnalysisLine.create({ data: { budgetId: budget.id, costItemId: item.id, category: "MATERIAL", description: "Synthetic graph material", unit: "un", coefficient: 1, unitCost: 50, totalCost: 50 } });
    const labor = await prisma.costAnalysisLine.create({ data: { budgetId: budget.id, costItemId: item.id, category: "LABOR", description: "Synthetic graph labor", unit: "un", coefficient: 1, unitCost: 50, totalCost: 50 } });
    return { project, budget, node, item, material, labor, tenant: ownerTenant, company: ownerCompany ?? companyId, contact: counterparty };
  }
  type Scope = Awaited<ReturnType<typeof scope>>;
  async function order(s: Scope, options: { company?: string; apuId?: string | null } = {}) {
    return prisma.purchaseOrder.create({ data: { tenantId: s.tenant, companyId: options.company ?? s.company, projectId: s.project.id, supplierContactId: s.contact, number: ++number, issueDate: date, status: "CONFIRMED", subtotal: 100, totalAmount: 100, lines: { create: { wbsNodeId: s.node.id, costAnalysisLineId: options.apuId === undefined ? s.material.id : options.apuId, costType: null, description: "Synthetic graph PO", unit: "un", quantity: 1, unitPrice: 100, lineSubtotal: 100, lineTotal: 100 } } }, include: { lines: true } });
  }
  type Order = Awaited<ReturnType<typeof order>>;
  async function invoice(s: Scope, options: { po?: Order; linePoId?: string | null; apuId?: string | null; parentId?: string; kind?: "INVOICE" | "CREDIT_NOTE"; issueDate?: Date } = {}) {
    return prisma.supplierInvoice.create({ data: { tenantId: s.tenant, companyId: s.company, projectId: s.project.id, supplierContactId: s.contact, number: ++number, issueDate: options.issueDate ?? date, dueDate: date, currency: "ARS", status: "ISSUED", subtotal: 100, totalAmount: 100, documentKind: options.kind ?? "INVOICE", referencedSupplierInvoiceId: options.parentId, purchaseOrderId: options.po?.id, lines: { create: { wbsNodeId: s.node.id, costAnalysisLineId: options.apuId === undefined ? s.labor.id : options.apuId, purchaseOrderLineId: options.linePoId === undefined ? options.po?.lines[0]!.id : options.linePoId, costType: null, description: "Synthetic graph invoice", quantity: 1, unitPrice: 100, lineSubtotal: 100, lineTotal: 100 } } }, include: { lines: true } });
  }
  type Invoice = Awaited<ReturnType<typeof invoice>>;
  async function payable(s: Scope, inv: Invoice) {
    return prisma.payable.create({ data: { tenantId: s.tenant, companyId: s.company, projectId: s.project.id, supplierContactId: s.contact, supplierInvoiceId: inv.id, issueDate: date, dueDate: date, currency: "ARS", originalAmount: 100, paidAmount: 10, status: "PARTIAL" } });
  }
  async function payment(s: Scope, inv: Invoice, payableId: string) {
    return prisma.payment.create({ data: { tenantId: s.tenant, companyId: s.company, projectId: s.project.id, supplierContactId: s.contact, supplierInvoiceId: inv.id, payableId, accountId, paymentDate: date, currency: "ARS", amount: 10, amountArs: 10, status: "CONFIRMED" } });
  }
  async function rejectsBoth(s: Scope) {
    await assert.rejects(() => getProjectCostControl(s.project.id, {}, ctx), conflict);
    await assert.rejects(() => getWbsItemCostDetail(s.node.id, s.project.id, {}, ctx), conflict);
  }
  async function subcontract(s: Scope) {
    return prisma.subcontract.create({ data: { tenantId: s.tenant, companyId: s.company, projectId: s.project.id, subcontractorContactId: s.contact, number: ++number, title: "Synthetic graph subcontract", contractDate: date, status: "ACTIVE", lines: { create: { wbsNodeId: s.node.id, description: "Synthetic graph subcontract item", unit: "un", quantity: 1, unitPrice: 100, lineTotal: 100 } } }, include: { lines: true } });
  }
  async function subCertification(s: Scope, contract: Awaited<ReturnType<typeof subcontract>>, lineId: string) {
    return prisma.subcontractCertification.create({ data: { tenantId: s.tenant, companyId: s.company, projectId: s.project.id, subcontractorContactId: s.contact, subcontractId: contract.id, number: ++number, periodStart: date, periodEnd: date, certificationDate: date, status: "APPROVED", lines: { create: { subcontractLineId: lineId, previousQty: 0, currentQty: "0.5", cumulativeQty: "0.5", remainingQty: "0.5", unitPriceSnapshot: 100, lineTotal: 50 } } } });
  }

  it("rejects CostItem budget/WBS contradictions before reporting monetary values", async () => {
    const s = await scope(); await prisma.costItem.update({ where: { id: s.item.id }, data: { budgetId: foreign.budget.id } });
    await rejectsBoth(s);
  });
  it("rejects APU budget/CostItem contradictions instead of silently excluding the child", async () => {
    const s = await scope(); await prisma.costAnalysisLine.update({ where: { id: s.labor.id }, data: { budgetId: foreign.budget.id } });
    await rejectsBoth(s);
  });
  it("rejects an own invoice pointing to another tenant's PO header", async () => {
    const s = await scope(), po = await order(foreign); await invoice(s, { po });
    await rejectsBoth(s);
  });
  it("rejects an own invoice pointing to a PO from another company on the shared project", async () => {
    const s = await scope(), po = await order(s, { company: otherCompanyId }); await invoice(s, { po });
    await rejectsBoth(s);
  });
  it("rejects a PO-line FK from a different project even without a header link", async () => {
    const s = await scope(), otherProject = await scope(), po = await order(otherProject);
    await invoice(s, { linePoId: po.lines[0]!.id }); await rejectsBoth(s);
  });
  it("rejects a line from another PO of the same project when the invoice has a header", async () => {
    const s = await scope(), header = await order(s), other = await order(s);
    await invoice(s, { po: header, linePoId: other.lines[0]!.id }); await rejectsBoth(s);
  });
  it("checks the related PO of a note's older parent even when the parent is outside the period", async () => {
    const s = await scope(), po = await order(foreign);
    const parent = await invoice(s, { po, issueDate: olderDate }); await invoice(s, { parentId: parent.id, kind: "CREDIT_NOTE" });
    await assert.rejects(() => getProjectCostControl(s.project.id, { dateFrom: "2026-11-01" }, ctx), conflict);
    await assert.rejects(() => getWbsItemCostDetail(s.node.id, s.project.id, { dateFrom: "2026-11-01" }, ctx), conflict);
  });
  it("rejects a note whose parent belongs to another tenant", async () => {
    const s = await scope(), parent = await invoice(foreign); await invoice(s, { parentId: parent.id, kind: "CREDIT_NOTE" });
    await rejectsBoth(s);
  });
  it("rejects an own payment whose payable belongs to another tenant", async () => {
    const s = await scope(), inv = await invoice(s), otherInv = await invoice(foreign), otherPayable = await payable(foreign, otherInv);
    await payment(s, inv, otherPayable.id); await rejectsBoth(s);
  });
  it("rejects distinct payment and payable invoice IDs even within the same scope", async () => {
    const s = await scope(), inv = await invoice(s), otherInv = await invoice(s), debt = await payable(s, otherInv);
    await payment(s, inv, debt.id); await rejectsBoth(s);
  });
  it("rejects a foreign APU hint reached only through a PO line", async () => {
    const s = await scope(); await order(s, { apuId: foreign.labor.id });
    await rejectsBoth(s);
  });
  it("preserves shared budgets and classifies retagged invoice/payment by their own APU", async () => {
    const s = await scope({ company: null }), po = await order(s), inv = await invoice(s, { po });
    const debt = await payable(s, inv); await payment(s, inv, debt.id);
    const result = await getProjectCostControl(s.project.id, {}, ctx);
    assert.equal(result.type, "REPORT"); if (result.type !== "REPORT") return;
    const row = result.rows[0]!;
    assert.equal(row.accruedCost, "100.00"); assert.equal(row.paidCost, "10.00"); assert.equal(row.expectedCostExposure, "100.00");
    const labor = row.byCostType.find((bucket) => bucket.costType === "LABOR")!, material = row.byCostType.find((bucket) => bucket.costType === "MATERIAL")!;
    assert.equal(labor.accruedCost, "100.00"); assert.equal(labor.paidCost, "10.00"); assert.equal(material.openCommittedCost, "0.00");
    assert.equal(row.byCostType.reduce((sum, bucket) => sum.add(bucket.expectedCostExposure), new Prisma.Decimal(0)).toFixed(2), row.expectedCostExposure);
    const detail = await getWbsItemCostDetail(s.node.id, s.project.id, {}, ctx);
    assert.equal(detail.supplierInvoices[0]!.costTypeLabel, "Mano de obra"); assert.equal(detail.payments.length, 1);
    assert.equal(detail.purchaseOrderLines[0]!.costType, "MATERIAL");
  });
  it("rejects a receipt line whose receipt header belongs to a different PO", async () => {
    const s = await scope(), ownOrder = await order(s), otherOrder = await order(s);
    await prisma.purchaseReceipt.create({ data: { tenantId, companyId, projectId: s.project.id, purchaseOrderId: otherOrder.id, supplierContactId: contactId, receiptDate: date, status: "CONFIRMED", lines: { create: { purchaseOrderLineId: ownOrder.lines[0]!.id, quantityReceived: 1 } } } });
    await assert.rejects(() => getProjectCostControl(s.project.id, {}, ctx), conflict);
  });
  it("keeps a valid receipt in net received cost after relation validation", async () => {
    const s = await scope(), ownOrder = await order(s);
    await prisma.purchaseReceipt.create({ data: { tenantId, companyId, projectId: s.project.id, purchaseOrderId: ownOrder.id, supplierContactId: contactId, receiptDate: date, status: "CONFIRMED", lines: { create: { purchaseOrderLineId: ownOrder.lines[0]!.id, quantityReceived: 1 } } } });
    const report = await getProjectCostControl(s.project.id, {}, ctx);
    assert.equal(report.type, "REPORT"); if (report.type !== "REPORT") return;
    assert.equal(report.totals.receivedCost, "100.00");
  });
  it("rejects a certification line taken from a different subcontract", async () => {
    const s = await scope(), ownContract = await subcontract(s), otherContract = await subcontract(s);
    await subCertification(s, ownContract, otherContract.lines[0]!.id); await rejectsBoth(s);
  });
  it("keeps a valid subcontract certification and its precise exposure", async () => {
    const s = await scope(), contract = await subcontract(s);
    await subCertification(s, contract, contract.lines[0]!.id);
    const report = await getProjectCostControl(s.project.id, {}, ctx);
    assert.equal(report.type, "REPORT"); if (report.type !== "REPORT") return;
    assert.equal(report.totals.accruedCost, "50.00"); assert.equal(report.totals.openCommittedCost, "50.00"); assert.equal(report.totals.expectedCostExposure, "100.00");
    const detail = await getWbsItemCostDetail(s.node.id, s.project.id, {}, ctx);
    assert.equal(detail.subcontractCertLines.length, 1);
  });
});
