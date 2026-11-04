import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { Prisma, prisma, type CostCategory } from "@bloqer/database";

import { listApprovedBudgetsForProject, resolveApprovedBudgetForProject } from "../reports/report-budget-resolve";
import { clearProjectAccessModeCache } from "../security/access";
import { assertAuditDatabaseIdentity } from "../testing/audit-fixture";
import { ServiceError, type ServiceContext } from "../types";
import { getProjectCostControl, getWbsItemCostDetail } from "./cost-control.service";
import { getProjectAccruedByMonth } from "./project-accrued-aggregation";
import { exportMaterialVarianceCsv, exportProjectCostControlCsv, exportResourceVarianceCsv } from "../report-exports/report-export.service";
import { getMaterialLinesWithoutProduct, getMaterialVarianceReport } from "../reports/material-variance.service";
import { getProjectMaterialShortagesTool } from "../ai/tools/materials-tools";

const live = process.env.BLOQER_AUDIT_LIVE === "1";
const denied = (error: unknown) => error instanceof ServiceError && ["FORBIDDEN", "NOT_FOUND"].includes(error.code);

describe("AG-05 cost control: real scopes, allocation and comparability", { skip: !live, concurrency: false }, () => {
  const tenantId = randomUUID(), companyId = randomUUID(), otherCompanyId = randomUUID();
  const actorUserId = randomUUID(), contactId = randomUUID();
  const ctx: ServiceContext = { tenantId, companyId, actorUserId, roles: ["OWNER"] };
  let verified = false, documentNumber = 0;
  const date = new Date("2026-11-04T00:00:00Z");

  before(async () => {
    await assertAuditDatabaseIdentity(prisma);
    verified = true;
    clearProjectAccessModeCache();
    await prisma.$transaction(async (tx) => {
      await tx.tenant.create({ data: { id: tenantId, name: "Synthetic AG05 costs", slug: `audit-cost-${tenantId}`, projectAccessMode: "MEMBERSHIP_SCOPED" } });
      await tx.company.createMany({ data: [companyId, otherCompanyId].map((id) => ({ id, tenantId, name: "Synthetic costs company" })) });
      await tx.user.create({ data: { id: actorUserId, email: `audit-cost-${actorUserId}@example.test`, status: "ACTIVE" } });
      await tx.userMembership.create({ data: { tenantId, companyId, userId: actorUserId, roles: ["OWNER"] } });
      await tx.contact.create({ data: { id: contactId, tenantId, legalName: "Synthetic cost counterparty" } });
      await tx.contactRole.createMany({ data: ["CLIENT", "SUPPLIER"].map((role) => ({ tenantId, contactId, role: role as "CLIENT" | "SUPPLIER" })) });
    });
  });

  after(async () => {
    clearProjectAccessModeCache();
    if (!verified) return;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.supplierInvoiceLine.deleteMany({ where: { invoice: { tenantId } } });
        await tx.supplierInvoice.deleteMany({ where: { tenantId } });
        await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrder: { tenantId } } });
        await tx.purchaseOrder.deleteMany({ where: { tenantId } });
        await tx.costAnalysisLine.deleteMany({ where: { budget: { tenantId } } });
        await tx.costItem.deleteMany({ where: { budget: { tenantId } } });
        await tx.wbsNode.deleteMany({ where: { budget: { tenantId } } });
        await tx.budget.deleteMany({ where: { tenantId } });
        await tx.projectMembership.deleteMany({ where: { tenantId } });
        await tx.project.deleteMany({ where: { tenantId } });
        await tx.contactRole.deleteMany({ where: { tenantId } });
        await tx.contact.deleteMany({ where: { tenantId } });
        await tx.userMembership.deleteMany({ where: { tenantId } });
        await tx.tenantModuleSetting.deleteMany({ where: { tenantId } });
        await tx.company.deleteMany({ where: { tenantId } });
        await tx.tenant.deleteMany({ where: { id: tenantId } });
        await tx.user.deleteMany({ where: { id: actorUserId } });
      }, { timeout: 30_000 });
    } finally { await prisma.$disconnect(); }
  });

  async function scope() {
    const project = await prisma.project.create({ data: { tenantId, companyId: null, code: randomUUID(), name: "Synthetic shared project", clientContactId: contactId, country: "AR", status: "ACTIVE" } });
    const budget = await prisma.budget.create({ data: { tenantId, companyId, projectId: project.id, name: "Synthetic baseline", versionNumber: 1, status: "APPROVED", currency: "ARS" } });
    const node = await prisma.wbsNode.create({ data: { budgetId: budget.id, code: "1", name: "Synthetic item", type: "ITEM" } });
    const item = await prisma.costItem.create({ data: { budgetId: budget.id, wbsNodeId: node.id, unit: "un", quantity: 1, unitCostDirect: 1000, totalCostDirect: 1000, unitSalePrice: 1200, totalSalePrice: 1200 } });
    await prisma.costAnalysisLine.create({ data: { budgetId: budget.id, costItemId: item.id, category: "MATERIAL", description: "Synthetic material", unit: "un", coefficient: 1, unitCost: 1000, totalCost: 1000 } });
    return { project, budget, node, item };
  }
  type Scope = Awaited<ReturnType<typeof scope>>;

  async function order(s: Scope, amount: string, options: { company?: string; type?: CostCategory; unit?: string; issueDate?: Date; wbsId?: string } = {}) {
    return prisma.purchaseOrder.create({ data: {
      tenantId, companyId: options.company ?? companyId, projectId: s.project.id, supplierContactId: contactId,
      number: ++documentNumber, issueDate: options.issueDate ?? date, status: "CONFIRMED", subtotal: amount, totalAmount: amount,
      lines: { create: { wbsNodeId: options.wbsId ?? s.node.id, description: "Synthetic order line", quantity: 1, unit: options.unit ?? "un", unitPrice: amount, lineSubtotal: amount, lineTotal: amount, costType: options.type ?? "MATERIAL" } },
    }, include: { lines: true } });
  }

  async function invoice(s: Scope, amount: string, options: { order?: Awaited<ReturnType<typeof order>>; company?: string; type?: CostCategory; parentId?: string; kind?: "INVOICE" | "CREDIT_NOTE" | "DEBIT_NOTE"; unassigned?: boolean; wbsId?: string } = {}) {
    const net = new Prisma.Decimal(amount), tax = net.mul("0.21"), gross = net.add(tax);
    return prisma.supplierInvoice.create({ data: {
      tenantId, companyId: options.company ?? companyId, projectId: s.project.id, supplierContactId: contactId,
      number: ++documentNumber, issueDate: date, dueDate: date, status: "ISSUED", subtotal: net, taxAmount: tax, totalAmount: gross,
      documentKind: options.kind ?? "INVOICE", referencedSupplierInvoiceId: options.parentId,
      purchaseOrderId: options.order?.id,
      lines: { create: { wbsNodeId: options.unassigned ? null : options.wbsId ?? s.node.id, purchaseOrderLineId: options.order?.lines[0]!.id, description: "Synthetic invoice line", quantity: 1, unitPrice: net, lineSubtotal: net, lineTax: tax, lineTotal: gross, costType: options.type ?? "MATERIAL" } },
    } });
  }

  it("checks project ACL before detail, selectors and accrued queries", async () => {
    const s = await scope();
    const unassigned: ServiceContext = { ...ctx, roles: ["PROJECT_MANAGER"] };
    await assert.rejects(() => getWbsItemCostDetail(s.node.id, s.project.id, {}, unassigned), denied);
    await assert.rejects(() => listApprovedBudgetsForProject(s.project.id, unassigned), denied);
    await assert.rejects(() => resolveApprovedBudgetForProject(s.project.id, undefined, unassigned), denied);
    await assert.rejects(() => getProjectAccruedByMonth(s.project.id, {}, unassigned), denied);
  });

  it("filters budget company independently of a shared project", async () => {
    const s = await scope();
    const hidden = await prisma.budget.create({ data: { tenantId, companyId: otherCompanyId, projectId: s.project.id, name: "Other company baseline", versionNumber: 2, status: "CLOSED" } });
    const hiddenNode = await prisma.wbsNode.create({ data: { budgetId: hidden.id, code: "1", name: "Hidden item", type: "ITEM" } });
    assert.deepEqual((await listApprovedBudgetsForProject(s.project.id, ctx)).map((row) => row.id), [s.budget.id]);
    await assert.rejects(() => getProjectCostControl(s.project.id, { budgetId: hidden.id }, ctx), denied);
    await assert.rejects(() => getWbsItemCostDetail(hiddenNode.id, s.project.id, {}, ctx), denied);
  });

  it("does not offset over-invoicing against a different order or cost type", async () => {
    const s = await scope();
    const first = await order(s, "100");
    await order(s, "100", { type: "LABOR" });
    await invoice(s, "150", { order: first, type: "LABOR" });
    await order(s, "999", { company: otherCompanyId });
    await invoice(s, "999", { company: otherCompanyId });
    const result = await getProjectCostControl(s.project.id, {}, ctx);
    assert.equal(result.type, "REPORT"); if (result.type !== "REPORT") return;
    assert.equal(result.currency, "ARS");
    assert.equal(result.totals.committedCost, "200.00");
    assert.equal(result.totals.accruedCost, "150.00");
    assert.equal(result.totals.openCommittedCost, "100.00");
    assert.equal(result.totals.expectedCostExposure, "250.00");
    const bucketTotal = result.rows[0]!.byCostType.reduce((sum, row) => sum.add(row.expectedCostExposure), new Prisma.Decimal(0));
    assert.equal(bucketTotal.toFixed(2), result.totals.expectedCostExposure);
  });

  it("a credit without direct PO links consumes the same unique commitment as its invoice", async () => {
    const s = await scope(), po = await order(s, "100");
    const parent = await invoice(s, "100", { order: po });
    await invoice(s, "20", { parentId: parent.id, kind: "CREDIT_NOTE" });
    const result = await getProjectCostControl(s.project.id, {}, ctx);
    assert.equal(result.type, "REPORT"); if (result.type !== "REPORT") return;
    assert.equal(result.totals.accruedCost, "80.00");
    assert.equal(result.totals.openCommittedCost, "20.00");
    assert.equal(result.totals.expectedCostExposure, "100.00");
  });

  it("keeps unassigned accrual net of IVA", async () => {
    const s = await scope(); await invoice(s, "100", { unassigned: true });
    const result = await getProjectCostControl(s.project.id, {}, ctx);
    assert.equal(result.type, "REPORT"); if (result.type !== "REPORT") return;
    assert.equal(result.unallocatedAccruedCost, "100.00");
  });

  it("does not label a different budget's spend as unassigned", async () => {
    const s = await scope();
    const other = await prisma.budget.create({ data: { tenantId, companyId, projectId: s.project.id, parentBudgetId: s.budget.id, name: "Synthetic addendum", versionNumber: 2, status: "APPROVED" } });
    const node = await prisma.wbsNode.create({ data: { budgetId: other.id, code: "1", name: "Other budget item", type: "ITEM" } });
    await order(s, "55", { wbsId: node.id }); await invoice(s, "55", { wbsId: node.id });
    const result = await getProjectCostControl(s.project.id, { budgetId: s.budget.id }, ctx);
    assert.equal(result.type, "REPORT"); if (result.type !== "REPORT") return;
    assert.equal(result.unallocatedCommittedCost, "0.00"); assert.equal(result.unallocatedAccruedCost, "0.00");
  });

  it("does not equate resource quantities in kg with the WBS unit", async () => {
    const s = await scope(); await order(s, "100", { unit: "kg" });
    const result = await getProjectCostControl(s.project.id, {}, ctx);
    assert.equal(result.type, "REPORT"); if (result.type !== "REPORT") return;
    assert.equal(result.rows[0]!.qtyCommitted, null);
    assert.equal(result.rows[0]!.committedCost, "100.00");
    const exported = await exportProjectCostControlCsv(s.project.id, {}, ctx);
    assert.ok(exported.content.includes("Moneda"));
    assert.ok(exported.content.includes("ARS"));
  });

  it("monthly accrual uses net cost and the same company scope", async () => {
    const s = await scope();
    await invoice(s, "100"); await invoice(s, "999", { company: otherCompanyId });
    const result = await getProjectAccruedByMonth(s.project.id, {}, ctx);
    assert.equal(result.total.toFixed(2), "100.00");
    assert.equal(result.series[0]!.amount.toFixed(2), "100.00");
  });

  it("material variance rejects an APU child with a contradictory budget", async () => {
    const s = await scope();
    const hidden = await prisma.budget.create({ data: { tenantId, companyId: otherCompanyId, projectId: s.project.id, name: "Other company", versionNumber: 2, status: "CLOSED" } });
    await prisma.costAnalysisLine.updateMany({ where: { costItemId: s.item.id }, data: { budgetId: hidden.id } });
    const conflict = (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT";
    await assert.rejects(() => getMaterialVarianceReport(s.project.id, {}, ctx), conflict);
    await assert.rejects(() => getMaterialLinesWithoutProduct(s.project.id, undefined, ctx), conflict);
  });

  it("material and resource CSV exports identify the budget currency", async () => {
    const s = await scope();
    for (const result of [await exportMaterialVarianceCsv(s.project.id, {}, ctx), await exportResourceVarianceCsv(s.project.id, "LABOR", {}, ctx)]) {
      assert.ok(result.content.includes("Moneda")); assert.ok(result.content.includes("ARS"));
    }
  });

  it("material variance rejects a CostItem declared in A but linked to WBS B", async () => {
    const s = await scope();
    const hidden = await prisma.budget.create({ data: { tenantId, companyId: otherCompanyId, projectId: s.project.id, name: "Other company", versionNumber: 2, status: "CLOSED" } });
    const hiddenNode = await prisma.wbsNode.create({ data: { budgetId: hidden.id, code: "1", name: "Foreign WBS", type: "ITEM" } });
    await prisma.costItem.update({ where: { id: s.item.id }, data: { wbsNodeId: hiddenNode.id } });
    await assert.rejects(() => getMaterialVarianceReport(s.project.id, {}, ctx), (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT");
  });

  it("material variance rejects an APU declared in A but linked to CostItem B", async () => {
    const s = await scope();
    const hidden = await prisma.budget.create({ data: { tenantId, companyId: otherCompanyId, projectId: s.project.id, name: "Other company", versionNumber: 2, status: "CLOSED" } });
    const hiddenNode = await prisma.wbsNode.create({ data: { budgetId: hidden.id, code: "1", name: "Foreign WBS", type: "ITEM" } });
    const hiddenItem = await prisma.costItem.create({ data: { budgetId: hidden.id, wbsNodeId: hiddenNode.id, unit: "un", quantity: 1 } });
    await prisma.costAnalysisLine.updateMany({ where: { costItemId: s.item.id }, data: { costItemId: hiddenItem.id } });
    await assert.rejects(() => getMaterialVarianceReport(s.project.id, {}, ctx), (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT");
  });

  it("applies the document period to the drilldown and rejects impossible dates", async () => {
    const s = await scope(); await order(s, "10", { issueDate: new Date("2026-10-01T00:00:00Z") }); await order(s, "20");
    const detail = await getWbsItemCostDetail(s.node.id, s.project.id, { dateFrom: "2026-11-01", dateTo: "2026-11-04" }, ctx);
    assert.equal(detail.purchaseOrderLines.length, 1); assert.equal(detail.currency, "ARS");
    assert.equal(detail.periodFiltered, true);
    assert.equal(detail.byCostType[0]!.committedCost, "20.00");
    assert.equal(detail.progressSummary.committedPctOfCost, "2.00");
    await assert.rejects(() => getProjectCostControl(s.project.id, { dateFrom: "2026-02-31" }, ctx), (error: unknown) => error instanceof ServiceError && error.code === "VALIDATION");
  });

  it("excludes AP and order details for an assigned foreman without those source permissions", async () => {
    const s = await scope(), po = await order(s, "100"); await invoice(s, "100", { order: po });
    await prisma.projectMembership.create({ data: { tenantId, projectId: s.project.id, userId: actorUserId } });
    const foreman: ServiceContext = { ...ctx, roles: ["SITE_FOREMAN"] };
    const detail = await getWbsItemCostDetail(s.node.id, s.project.id, {}, foreman);
    assert.deepEqual(detail.supplierInvoices, []); assert.deepEqual(detail.purchaseOrderLines, []);
    const result = await getProjectCostControl(s.project.id, {}, foreman);
    assert.equal(result.type, "REPORT"); if (result.type !== "REPORT") return;
    assert.equal(result.totals.accruedCost, "0.00"); assert.ok(result.warnings.some((warning) => warning.includes("Sin permiso")));
  });

  it("preserves restricted-source warnings in the AI materials interface", async () => {
    const s = await scope();
    await prisma.projectMembership.create({ data: { tenantId, projectId: s.project.id, userId: actorUserId } });
    const result = await getProjectMaterialShortagesTool.execute({
      service: { ...ctx, roles: ["SITE_FOREMAN"] }, correlationId: randomUUID(), locale: "es-AR", timezone: "America/Argentina/Buenos_Aires",
    }, { projectId: s.project.id });
    const data = result.data as { warnings: string[] };
    assert.ok(Array.isArray(data.warnings));
    assert.ok(data.warnings.length > 0);
  });
});
