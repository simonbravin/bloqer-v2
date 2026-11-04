/** D-122 regression: original budget currency, scoped contributing documents, no implicit FX. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { Prisma, prisma } from "@bloqer/database";

import { getProjectResourceBoard } from "./project-resource-board.service";
import { getResourceVarianceReport } from "./resource-variance.service";
import { clearProjectAccessModeCache } from "../security/access";
import { assertAuditDatabaseIdentity } from "../testing/audit-fixture";
import { ServiceError, type ServiceContext } from "../types";

const live = process.env.BLOQER_AUDIT_LIVE === "1";
const mismatch = (error: unknown) => error instanceof ServiceError && error.code === "VALIDATION" &&
  error.message.includes("resultado económico") && error.message.includes("cantidades siguen disponibles");

describe("AG-05 D-122 resource currency on isolated SQL", { skip: !live, concurrency: false }, () => {
  const tenantId = randomUUID(), companyId = randomUUID(), otherCompanyId = randomUUID();
  const ownerId = randomUUID(), readerId = randomUUID(), contactId = randomUUID();
  const ctx: ServiceContext = { tenantId, companyId, actorUserId: ownerId, roles: ["OWNER"] };
  const reader: ServiceContext = { tenantId, companyId, actorUserId: readerId, roles: ["PROJECT_VIEWER"] };
  const day = new Date("2026-11-04T00:00:00.000Z");
  let verified = false, number = 0;

  before(async () => {
    await assertAuditDatabaseIdentity(prisma);
    verified = true;
    clearProjectAccessModeCache();
    await prisma.$transaction(async (tx) => {
      await tx.tenant.create({ data: { id: tenantId, name: "Synthetic resource currency", slug: `audit-resource-currency-${tenantId}`, projectAccessMode: "MEMBERSHIP_SCOPED" } });
      await tx.company.createMany({ data: [companyId, otherCompanyId].map((id) => ({ id, tenantId, name: "Synthetic currency company" })) });
      await tx.user.createMany({ data: [ownerId, readerId].map((id) => ({ id, email: `audit-resource-currency-${id}@example.test`, status: "ACTIVE" })) });
      await tx.userMembership.createMany({ data: [
        { tenantId, companyId, userId: ownerId, roles: ["OWNER"] },
        { tenantId, companyId, userId: readerId, roles: ["PROJECT_VIEWER"] },
      ] });
      await tx.contact.create({ data: { id: contactId, tenantId, legalName: "Synthetic currency counterparty" } });
      await tx.contactRole.createMany({ data: ["CLIENT", "SUPPLIER"].map((role) => ({ tenantId, contactId, role: role as "CLIENT" | "SUPPLIER" })) });
    }, { timeout: 30_000 });
  });

  after(async () => {
    clearProjectAccessModeCache();
    if (!verified) return;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.supplierInvoiceLine.deleteMany({ where: { invoice: { tenantId } } });
        await tx.supplierInvoice.deleteMany({ where: { tenantId, documentKind: { not: "INVOICE" } } });
        await tx.supplierInvoice.deleteMany({ where: { tenantId } });
        await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrder: { tenantId } } });
        await tx.purchaseOrder.deleteMany({ where: { tenantId } });
        await tx.costAnalysisLine.deleteMany({ where: { budget: { tenantId } } });
        await tx.costItem.deleteMany({ where: { budget: { tenantId } } });
        await tx.wbsNode.deleteMany({ where: { budget: { tenantId } } });
        await tx.budget.deleteMany({ where: { tenantId, parentBudgetId: { not: null } } });
        await tx.budget.deleteMany({ where: { tenantId } });
        await tx.projectMembership.deleteMany({ where: { tenantId } });
        await tx.project.deleteMany({ where: { tenantId } });
        await tx.contactRole.deleteMany({ where: { tenantId } });
        await tx.contact.deleteMany({ where: { tenantId } });
        await tx.userMembership.deleteMany({ where: { tenantId } });
        await tx.tenantModuleSetting.deleteMany({ where: { tenantId } });
        await tx.company.deleteMany({ where: { tenantId } });
        await tx.tenant.deleteMany({ where: { id: tenantId } });
        await tx.user.deleteMany({ where: { id: { in: [ownerId, readerId] } } });
      }, { timeout: 30_000 });
    } finally { await prisma.$disconnect(); }
  });

  async function scope(options: { currency?: string; projectId?: string; parentBudgetId?: string; sharedBudget?: boolean } = {}) {
    const projectId = options.projectId ?? randomUUID(), budgetId = randomUUID(), wbsId = randomUUID();
    const costId = randomUUID(), laborId = randomUUID(), equipmentId = randomUUID();
    await prisma.$transaction(async (tx) => {
      if (!options.projectId) {
        await tx.project.create({ data: { id: projectId, tenantId, companyId: null, code: randomUUID(), name: "Synthetic currency project", clientContactId: contactId, country: "AR", status: "ACTIVE" } });
        await tx.projectMembership.create({ data: { tenantId, projectId, userId: readerId } });
      }
      await tx.budget.create({ data: { id: budgetId, tenantId, companyId: options.sharedBudget ? null : companyId, projectId, name: "Synthetic currency baseline", versionNumber: options.parentBudgetId ? 2 : 1, parentBudgetId: options.parentBudgetId, status: "APPROVED", currency: options.currency ?? "ARS" } });
      await tx.wbsNode.create({ data: { id: wbsId, budgetId, code: "1", name: "Synthetic currency item", type: "ITEM" } });
      await tx.costItem.create({ data: { id: costId, budgetId, wbsNodeId: wbsId, quantity: 1, unit: "un", unitCostDirect: 250, totalCostDirect: 250 } });
      await tx.costAnalysisLine.createMany({ data: [
        { id: laborId, budgetId, costItemId: costId, category: "LABOR", description: "Synthetic labor", unit: "h", coefficient: 10, partidaQuantity: 10, unitCost: 10, totalCost: 100, isLumpSum: false },
        { id: equipmentId, budgetId, costItemId: costId, category: "EQUIPMENT", description: "Synthetic equipment", unit: "h", coefficient: 10, partidaQuantity: 10, unitCost: 15, totalCost: 150, isLumpSum: false },
      ] });
    }, { timeout: 30_000 });
    return { projectId, budgetId, wbsId, costId, laborId, equipmentId };
  }
  type Scope = Awaited<ReturnType<typeof scope>>;

  async function invoice(s: Scope, options: {
    currency?: string; companyId?: string; amount?: string; date?: Date;
    category?: "LABOR" | "EQUIPMENT"; kind?: "INVOICE" | "CREDIT_NOTE" | "DEBIT_NOTE"; parentId?: string;
  } = {}) {
    const currency = options.currency ?? "ARS", amount = new Prisma.Decimal(options.amount ?? "20");
    const category = options.category ?? "LABOR", fxRate = currency === "ARS" ? 1 : 1000;
    return prisma.supplierInvoice.create({ data: {
      tenantId, companyId: options.companyId ?? companyId, projectId: s.projectId, supplierContactId: contactId,
      number: ++number, documentKind: options.kind ?? "INVOICE", referencedSupplierInvoiceId: options.parentId,
      issueDate: options.date ?? day, dueDate: options.date ?? day, status: "ISSUED", currency, fxRate,
      subtotal: amount, totalAmount: amount, amountArs: amount.mul(fxRate),
      lines: { create: { wbsNodeId: s.wbsId, costAnalysisLineId: category === "LABOR" ? s.laborId : s.equipmentId, costType: category,
        description: `Synthetic ${category}`, quantity: 2, unitPrice: amount.div(2), lineSubtotal: amount, lineTotal: amount } },
    } });
  }

  it("keeps USD budget/invoice/NC/ND in original currency and preserves net signs", async () => {
    const s = await scope({ currency: "USD" });
    const parent = await invoice(s, { currency: "USD", amount: "100" });
    await invoice(s, { currency: "USD", amount: "20", kind: "CREDIT_NOTE", parentId: parent.id });
    await invoice(s, { currency: "USD", amount: "10", kind: "DEBIT_NOTE", parentId: parent.id });
    const report = await getResourceVarianceReport(s.projectId, "LABOR", { budgetId: s.budgetId }, ctx);
    assert.equal(report.type, "REPORT"); if (report.type !== "REPORT") return;
    assert.equal(report.currency, "USD"); assert.equal(report.totals.budgetCost, "100.00");
    assert.equal(report.totals.accruedCost, "90.00"); assert.equal(report.totals.variance, "10.00");
  });

  for (const kind of ["INVOICE", "CREDIT_NOTE", "DEBIT_NOTE"] as const) {
    it(`rejects a contributing ${kind} in a different currency even with stored FX`, async () => {
      const s = await scope();
      const parent = kind === "INVOICE" ? null : await invoice(s, { currency: "USD", date: new Date("2026-11-03T00:00:00Z") });
      await invoice(s, { currency: "USD", kind, parentId: parent?.id });
      await assert.rejects(() => getResourceVarianceReport(s.projectId, "LABOR", { budgetId: s.budgetId, dateFrom: "2026-11-04", dateTo: "2026-11-04" }, ctx), mismatch);
      const quantities = await getProjectResourceBoard(s.projectId, "LABOR", { budgetId: s.budgetId, window: "all" }, ctx);
      assert.equal(quantities.type, "REPORT");
      if (quantities.type === "REPORT") assert.ok(quantities.rows.some((row) => row.costAnalysisLineId === s.laborId));
    });
  }

  it("applies the same comparison rule to equipment", async () => {
    const s = await scope(); await invoice(s, { currency: "USD", category: "EQUIPMENT" });
    await assert.rejects(() => getResourceVarianceReport(s.projectId, "EQUIPMENT", { budgetId: s.budgetId }, ctx), mismatch);
  });

  it("does not inspect another company's currency under a shared project and budget", async () => {
    const s = await scope({ sharedBudget: true });
    await invoice(s, { amount: "20" });
    await invoice(s, { currency: "USD", companyId: otherCompanyId });
    const report = await getResourceVarianceReport(s.projectId, "LABOR", { budgetId: s.budgetId }, ctx);
    assert.equal(report.type, "REPORT"); if (report.type !== "REPORT") return;
    assert.equal(report.totals.accruedCost, "20.00");
  });

  it("does not let a document assigned only to another budget block this budget", async () => {
    const s = await scope();
    const other = await scope({ currency: "USD", projectId: s.projectId, parentBudgetId: s.budgetId });
    await invoice(other, { currency: "USD" });
    const report = await getResourceVarianceReport(s.projectId, "LABOR", { budgetId: s.budgetId }, ctx);
    assert.equal(report.type, "REPORT"); if (report.type !== "REPORT") return;
    assert.equal(report.totals.accruedCost, "0.00"); assert.equal(report.totals.variance, "100.00");
  });

  it("applies the requested issue-date period before checking currency", async () => {
    const s = await scope(); await invoice(s, { currency: "USD", date: new Date("2026-11-03T00:00:00Z") });
    const report = await getResourceVarianceReport(s.projectId, "LABOR", { budgetId: s.budgetId, dateFrom: "2026-11-04", dateTo: "2026-11-04" }, ctx);
    assert.equal(report.type, "REPORT"); if (report.type !== "REPORT") return;
    assert.equal(report.totals.accruedCost, "0.00");
  });

  it("does not read a disabled AP source to perform a currency check", async () => {
    const s = await scope(); await invoice(s, { currency: "USD" });
    await prisma.tenantModuleSetting.create({ data: { tenantId, moduleKey: "AP", isEnabled: false } });
    try {
      const report = await getResourceVarianceReport(s.projectId, "LABOR", { budgetId: s.budgetId }, ctx);
      assert.equal(report.type, "REPORT"); if (report.type !== "REPORT") return;
      assert.equal(report.totals.accruedCost, "0.00"); assert.ok(report.warnings.some((warning) => warning.includes("AP no disponible")));
    } finally { await prisma.tenantModuleSetting.deleteMany({ where: { tenantId, moduleKey: "AP" } }); }
  });

  it("does not read AP without its source permission", async () => {
    const s = await scope(); await invoice(s, { currency: "USD" });
    const report = await getResourceVarianceReport(s.projectId, "LABOR", { budgetId: s.budgetId }, reader);
    assert.equal(report.type, "REPORT"); if (report.type !== "REPORT") return;
    assert.equal(report.totals.accruedCost, "0.00"); assert.ok(report.warnings.some((warning) => warning.includes("AP no disponible")));
  });

  it("does not expose another company's selected budget through a currency error", async () => {
    const s = await scope({ currency: "USD" });
    await prisma.budget.update({ where: { id: s.budgetId }, data: { companyId: otherCompanyId } });
    assert.deepEqual(await getResourceVarianceReport(s.projectId, "LABOR", { budgetId: s.budgetId }, ctx), { type: "NO_APPROVED_BUDGETS", costCategory: "LABOR" });
  });

  it("rejects a contributing document with an empty legacy currency", async () => {
    const s = await scope(); await invoice(s, { currency: "" });
    await assert.rejects(() => getResourceVarianceReport(s.projectId, "LABOR", { budgetId: s.budgetId }, ctx), mismatch);
  });

  it("rejects the inverted baseline APU graph before returning monetary values", async () => {
    const s = await scope();
    const other = await scope({ currency: "USD", projectId: s.projectId, parentBudgetId: s.budgetId });
    await prisma.costAnalysisLine.update({ where: { id: s.laborId }, data: { budgetId: other.budgetId } });
    await assert.rejects(() => getResourceVarianceReport(s.projectId, "LABOR", { budgetId: s.budgetId }, ctx),
      (error) => error instanceof ServiceError && error.code === "CONFLICT" && !error.message.includes(other.budgetId));
  });

  it("uses the invoice's own APU category before its PO fallback and currency check", async () => {
    const s = await scope();
    const order = await prisma.purchaseOrder.create({ data: {
      tenantId, companyId, projectId: s.projectId, supplierContactId: contactId, number: ++number,
      issueDate: day, status: "CONFIRMED", currency: "ARS", subtotal: 20, totalAmount: 20,
      lines: { create: { wbsNodeId: s.wbsId, costAnalysisLineId: s.equipmentId, costType: "EQUIPMENT", description: "Synthetic equipment source", quantity: 2, unit: "h", unitPrice: 10, lineSubtotal: 20, lineTotal: 20 } },
    }, include: { lines: true } });
    const document = await invoice(s);
    await prisma.$transaction([
      prisma.supplierInvoice.update({ where: { id: document.id }, data: { purchaseOrderId: order.id } }),
      prisma.supplierInvoiceLine.updateMany({ where: { invoiceId: document.id }, data: { costType: null, purchaseOrderLineId: order.lines[0]!.id } }),
    ]);
    const labor = await getResourceVarianceReport(s.projectId, "LABOR", { budgetId: s.budgetId }, ctx);
    const equipment = await getResourceVarianceReport(s.projectId, "EQUIPMENT", { budgetId: s.budgetId }, ctx);
    assert.equal(labor.type, "REPORT"); assert.equal(equipment.type, "REPORT");
    if (labor.type !== "REPORT" || equipment.type !== "REPORT") return;
    assert.equal(labor.totals.accruedCost, "20.00"); assert.equal(equipment.totals.accruedCost, "0.00");

    await prisma.$transaction([
      prisma.supplierInvoice.update({ where: { id: document.id }, data: { currency: "USD", fxRate: 1000, amountArs: 20_000 } }),
      prisma.purchaseOrder.update({ where: { id: order.id }, data: { currency: "USD", fxRate: 1000 } }),
    ]);
    const unaffected = await getResourceVarianceReport(s.projectId, "EQUIPMENT", { budgetId: s.budgetId }, ctx);
    assert.equal(unaffected.type, "REPORT");
    if (unaffected.type === "REPORT") assert.equal(unaffected.totals.accruedCost, "0.00");
    await assert.rejects(() => getResourceVarianceReport(s.projectId, "LABOR", { budgetId: s.budgetId }, ctx), mismatch);
  });

  it("rejects an invoice's APU hint from another budget before comparing its money", async () => {
    const s = await scope();
    const other = await scope({ currency: "USD", projectId: s.projectId, parentBudgetId: s.budgetId });
    const document = await invoice(s);
    await prisma.supplierInvoiceLine.updateMany({ where: { invoiceId: document.id }, data: { costAnalysisLineId: other.laborId } });
    await assert.rejects(() => getResourceVarianceReport(s.projectId, "LABOR", { budgetId: s.budgetId }, ctx),
      (error) => error instanceof ServiceError && error.code === "CONFLICT" && !error.message.includes(other.budgetId));
  });

  it("rejects an invoice's own APU hint from another WBS within the same budget", async () => {
    const s = await scope(), otherWbsId = randomUUID(), otherCostId = randomUUID(), otherApuId = randomUUID();
    const document = await invoice(s);
    await prisma.$transaction(async (tx) => {
      await tx.wbsNode.create({ data: { id: otherWbsId, budgetId: s.budgetId, code: "2", name: "Other synthetic currency item", type: "ITEM" } });
      await tx.costItem.create({ data: { id: otherCostId, budgetId: s.budgetId, wbsNodeId: otherWbsId, quantity: 1, unit: "un", unitCostDirect: 100, totalCostDirect: 100 } });
      await tx.costAnalysisLine.create({ data: { id: otherApuId, budgetId: s.budgetId, costItemId: otherCostId, category: "LABOR", description: "Other synthetic labor", unit: "h", coefficient: 10, partidaQuantity: 10, unitCost: 10, totalCost: 100, isLumpSum: false } });
      await tx.supplierInvoiceLine.updateMany({ where: { invoiceId: document.id }, data: { costAnalysisLineId: otherApuId } });
    }, { timeout: 30_000 });
    await assert.rejects(() => getResourceVarianceReport(s.projectId, "LABOR", { budgetId: s.budgetId }, ctx),
      (error) => error instanceof ServiceError && error.code === "CONFLICT" &&
        !error.message.includes(otherWbsId) && !error.message.includes(otherApuId));
  });
});
