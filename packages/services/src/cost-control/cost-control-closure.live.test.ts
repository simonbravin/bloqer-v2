/** Maintained real-SQL closure checks for D-122/D-123/D-124 and payment routing. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import * as XLSX from "xlsx";

import { Prisma, prisma, type CostCategory } from "@bloqer/database";
import { can } from "@bloqer/domain";

import { getCertificationMeasurementSheet } from "../certification/certification-measurement";
import { STOCK_CONSUMPTION_UNAVAILABLE_WARNING, STOCK_CONSUMPTION_UNVALUED_WARNING } from "../inventory/stock-consumption-warnings";
import { getMaterialVarianceReport } from "../reports/material-variance.service";
import { getProjectResourceBoard } from "../resources/project-resource-board.service";
import { exportScheduleXlsx } from "../schedule/schedule-export.service";
import { getProjectScheduleWorkspace } from "../schedule/schedule-workspace.service";
import { createScheduleItem } from "../schedule/schedule.service";
import { clearProjectAccessModeCache } from "../security/access";
import { assertAuditDatabaseIdentity } from "../testing/audit-fixture";
import { ServiceError, type ServiceContext } from "../types";
import type { CostControlFilters } from "./cost-control-types";
import { getProjectCostControl, getWbsItemCostDetail } from "./cost-control.service";

const live = process.env.BLOQER_AUDIT_LIVE === "1";
const currencyRejected = (error: unknown) => error instanceof ServiceError && error.code === "VALIDATION" && /moneda/i.test(error.message);

describe("AG-05 closure: native currency, payment origins and unknown stock valuation", { skip: !live, concurrency: false }, () => {
  const tenantId = randomUUID(), companyId = randomUUID(), otherCompanyId = randomUUID();
  const ownerId = randomUUID(), viewerId = randomUUID(), projectFinanceId = randomUUID(), contactId = randomUUID();
  const productId = randomUUID(), warehouseId = randomUUID(), otherWarehouseId = randomUUID();
  const accounts = new Map<string, string>();
  const ctx: ServiceContext = { tenantId, companyId, actorUserId: ownerId, roles: ["OWNER"] };
  const viewer: ServiceContext = { tenantId, companyId, actorUserId: viewerId, roles: ["PROJECT_VIEWER"] };
  const projectFinance: ServiceContext = { tenantId, companyId, actorUserId: projectFinanceId, roles: ["PROJECT_FINANCE"] };
  const day = new Date("2026-11-04T00:00:00.000Z"), older = new Date("2026-10-31T00:00:00.000Z");
  const period: CostControlFilters = { dateFrom: "2026-11-04", dateTo: "2026-11-04" };
  let verified = false, documentNumber = 0;

  before(async () => {
    await assertAuditDatabaseIdentity(prisma);
    verified = true;
    clearProjectAccessModeCache();
    await prisma.$transaction(async (tx) => {
      await tx.tenant.create({ data: { id: tenantId, name: "Synthetic AG05 closure", slug: `audit-closure-${tenantId}`, projectAccessMode: "MEMBERSHIP_SCOPED" } });
      await tx.company.createMany({ data: [companyId, otherCompanyId].map((id) => ({ id, tenantId, name: "Synthetic closure company" })) });
      await tx.user.createMany({ data: [ownerId, viewerId, projectFinanceId].map((id) => ({ id, email: `audit-closure-${id}@example.test`, status: "ACTIVE" })) });
      await tx.userMembership.createMany({ data: [
        { tenantId, companyId, userId: ownerId, roles: ["OWNER"] },
        { tenantId, companyId, userId: viewerId, roles: ["PROJECT_VIEWER"] },
        { tenantId, companyId, userId: projectFinanceId, roles: ["PROJECT_FINANCE"] },
      ] });
      await tx.contact.create({ data: { id: contactId, tenantId, legalName: "Synthetic closure counterparty" } });
      await tx.contactRole.createMany({ data: ["CLIENT", "SUPPLIER", "SUBCONTRACTOR"].map((role) => ({ tenantId, contactId, role: role as "CLIENT" | "SUPPLIER" | "SUBCONTRACTOR" })) });
      for (const accountCompany of [companyId, otherCompanyId]) {
        for (const currency of ["ARS", "USD"]) {
          const id = randomUUID();
          accounts.set(`${accountCompany}:${currency}`, id);
          await tx.treasuryAccount.create({ data: { id, tenantId, companyId: accountCompany, name: `Synthetic closure ${accountCompany} ${currency}`, type: "CASH", currency } });
        }
      }
      await tx.product.create({ data: { id: productId, tenantId, sku: `CLOSURE-${productId}`, name: "Synthetic closure material", unit: "un" } });
      await tx.warehouse.createMany({ data: [
        { id: warehouseId, tenantId, companyId, name: "Synthetic closure warehouse" },
        { id: otherWarehouseId, tenantId, companyId: otherCompanyId, name: "Other closure warehouse" },
      ] });
      await tx.stockMovement.createMany({ data: [
        { tenantId, companyId, warehouseId, productId, type: "IN", sourceType: "OPENING_BALANCE", movementDate: older, quantity: 1000, status: "CONFIRMED" },
        { tenantId, companyId: otherCompanyId, warehouseId: otherWarehouseId, productId, type: "IN", sourceType: "OPENING_BALANCE", movementDate: older, quantity: 1000, status: "CONFIRMED" },
      ] });
    }, { timeout: 30_000 });
  });

  after(async () => {
    clearProjectAccessModeCache();
    if (!verified) return;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.payment.deleteMany({ where: { tenantId } });
        await tx.payable.deleteMany({ where: { tenantId } });
        await tx.supplierInvoiceLine.deleteMany({ where: { invoice: { tenantId } } });
        await tx.supplierInvoice.deleteMany({ where: { tenantId, documentKind: { not: "INVOICE" } } });
        await tx.supplierInvoice.deleteMany({ where: { tenantId } });
        await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrder: { tenantId } } });
        await tx.purchaseOrder.deleteMany({ where: { tenantId } });
        await tx.subcontractCertificationLine.deleteMany({ where: { certification: { tenantId } } });
        await tx.subcontractCertification.deleteMany({ where: { tenantId } });
        await tx.subcontractLine.deleteMany({ where: { subcontract: { tenantId } } });
        await tx.subcontract.deleteMany({ where: { tenantId } });
        await tx.certificationLine.deleteMany({ where: { certification: { tenantId } } });
        await tx.certification.deleteMany({ where: { tenantId } });
        await tx.stockMovement.deleteMany({ where: { tenantId } });
        await tx.warehouse.deleteMany({ where: { tenantId } });
        await tx.product.deleteMany({ where: { tenantId } });
        await tx.scheduleItemWbsLink.deleteMany({ where: { tenantId } });
        await tx.scheduleItemDependency.deleteMany({ where: { tenantId } });
        await tx.scheduleItem.deleteMany({ where: { tenantId } });
        await tx.schedule.deleteMany({ where: { tenantId } });
        await tx.auditLog.deleteMany({ where: { tenantId } });
        await tx.costAnalysisLine.deleteMany({ where: { budget: { tenantId } } });
        await tx.costItem.deleteMany({ where: { budget: { tenantId } } });
        await tx.wbsNode.deleteMany({ where: { budget: { tenantId } } });
        await tx.budget.deleteMany({ where: { tenantId, parentBudgetId: { not: null } } });
        await tx.budget.deleteMany({ where: { tenantId } });
        await tx.projectMembership.deleteMany({ where: { tenantId } });
        await tx.project.deleteMany({ where: { tenantId } });
        await tx.treasuryAccount.deleteMany({ where: { tenantId } });
        await tx.contactRole.deleteMany({ where: { tenantId } });
        await tx.contact.deleteMany({ where: { tenantId } });
        await tx.userMembership.deleteMany({ where: { tenantId } });
        await tx.tenantModuleSetting.deleteMany({ where: { tenantId } });
        await tx.company.deleteMany({ where: { tenantId } });
        await tx.tenant.deleteMany({ where: { id: tenantId } });
        await tx.user.deleteMany({ where: { id: { in: [ownerId, viewerId, projectFinanceId] } } });
      }, { timeout: 30_000 });
    } finally { await prisma.$disconnect(); }
  });

  type Scope = { projectId: string; budgetId: string; wbsId: string; materialId: string; laborId: string; currency: string; company: string };

  async function scope(options: { currency?: string; company?: string; projectId?: string; parentBudgetId?: string } = {}): Promise<Scope> {
    const projectId = options.projectId ?? randomUUID(), budgetId = randomUUID(), currency = options.currency ?? "ARS", company = options.company ?? companyId;
    return prisma.$transaction(async (tx) => {
      if (!options.projectId) {
        await tx.project.create({ data: { id: projectId, tenantId, companyId: null, clientContactId: contactId, name: "Synthetic closure project", code: randomUUID(), country: "AR", status: "ACTIVE" } });
        await tx.projectMembership.createMany({ data: [ownerId, viewerId, projectFinanceId].map((userId) => ({ tenantId, projectId, userId })) });
      }
      await tx.budget.create({ data: { id: budgetId, tenantId, companyId: company, projectId, parentBudgetId: options.parentBudgetId, name: "Synthetic closure budget", versionNumber: ++documentNumber, currency, status: "APPROVED" } });
      return addWbs({ projectId, budgetId, currency, company }, "1", "Closure selected item", tx);
    }, { timeout: 30_000 });
  }

  async function addWbs(base: Pick<Scope, "projectId" | "budgetId" | "currency" | "company">, code: string, name: string, tx: Prisma.TransactionClient = prisma): Promise<Scope> {
    const wbsId = randomUUID(), itemId = randomUUID(), materialId = randomUUID(), laborId = randomUUID();
    await tx.wbsNode.create({ data: { id: wbsId, budgetId: base.budgetId, code, name, type: "ITEM" } });
    await tx.costItem.create({ data: { id: itemId, budgetId: base.budgetId, wbsNodeId: wbsId, unit: "un", quantity: 1, unitCostDirect: 1000, totalCostDirect: 1000, unitSalePrice: 1200, totalSalePrice: 1200 } });
    await tx.costAnalysisLine.createMany({ data: [
      { id: materialId, budgetId: base.budgetId, costItemId: itemId, category: "MATERIAL", description: "Closure material", unit: "un", coefficient: 1, unitCost: 700, totalCost: 700 },
      { id: laborId, budgetId: base.budgetId, costItemId: itemId, category: "LABOR", description: "Closure labor", unit: "h", coefficient: 12, partidaQuantity: 12, unitCost: 25, totalCost: 300 },
    ] });
    return { ...base, wbsId, materialId, laborId };
  }

  async function order(s: Scope, options: { currency?: string; date?: Date; amount?: string } = {}) {
    const amount = options.amount ?? "100", currency = options.currency ?? s.currency;
    const fxRate = new Prisma.Decimal(currency === "ARS" ? "1" : "1234.567890");
    return prisma.purchaseOrder.create({ data: {
      tenantId, companyId: s.company, projectId: s.projectId, supplierContactId: contactId,
      number: ++documentNumber, issueDate: options.date ?? day, status: "CONFIRMED", currency,
      fxRate, totalAmountArs: new Prisma.Decimal(amount).mul(fxRate).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP), subtotal: amount, totalAmount: amount,
      lines: { create: { wbsNodeId: s.wbsId, costAnalysisLineId: s.materialId, costType: "MATERIAL", description: "Synthetic closure order", unit: "un", quantity: 1, unitPrice: amount, lineSubtotal: amount, lineTotal: amount } },
    }, include: { lines: true } });
  }
  type Order = Awaited<ReturnType<typeof order>>;

  async function invoice(s: Scope, options: {
    currency?: string; date?: Date; amount?: string; quantity?: string; kind?: "INVOICE" | "CREDIT_NOTE" | "DEBIT_NOTE"; parentId?: string;
    order?: Order; allocation?: "direct" | "line" | "header" | "none"; purchaseOrderLineId?: string; directWbs?: boolean;
    apuId?: string; costType?: CostCategory; subCertId?: string;
  } = {}) {
    const amount = options.amount ?? "100", quantity = options.quantity ?? "1", currency = options.currency ?? s.currency;
    const fxRate = new Prisma.Decimal(currency === "ARS" ? "1" : "9876.543210");
    const allocation = options.allocation ?? (options.subCertId ? "none" : options.order ? "line" : "direct");
    const assigned = (allocation === "direct" || allocation === "line") && options.directWbs !== false;
    return prisma.supplierInvoice.create({ data: {
      tenantId, companyId: s.company, projectId: s.projectId, supplierContactId: contactId,
      number: ++documentNumber, issueDate: options.date ?? day, dueDate: day, currency,
      status: "ISSUED", subtotal: amount, totalAmount: amount, amountArs: new Prisma.Decimal(amount).mul(fxRate).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP), fxRate,
      documentKind: options.kind ?? "INVOICE", referencedSupplierInvoiceId: options.parentId,
      purchaseOrderId: options.order?.id, subcontractCertificationId: options.subCertId,
      lines: { create: {
        wbsNodeId: assigned ? s.wbsId : null, costAnalysisLineId: assigned ? (options.apuId ?? s.materialId) : null,
        purchaseOrderLineId: allocation === "line" ? (options.purchaseOrderLineId ?? options.order?.lines[0]!.id) : null,
        costType: options.costType ?? (options.subCertId ? "SUBCONTRACT" : "MATERIAL"), description: "Synthetic closure invoice",
        quantity, unitPrice: new Prisma.Decimal(amount).div(quantity), lineSubtotal: amount, lineTotal: amount,
      } },
    } });
  }
  type Invoice = Awaited<ReturnType<typeof invoice>>;

  async function payment(s: Scope, inv: Invoice, options: { currency?: string; date?: Date } = {}) {
    const debt = await prisma.payable.create({ data: { tenantId, companyId: s.company, projectId: s.projectId, supplierContactId: contactId, supplierInvoiceId: inv.id, issueDate: inv.issueDate, dueDate: day, currency: inv.currency, originalAmount: inv.totalAmount, paidAmount: 10, status: "PARTIAL" } });
    const currency = options.currency ?? inv.currency;
    const fxRate = new Prisma.Decimal(currency === "ARS" ? "1" : "5555.555555");
    return prisma.payment.create({ data: { tenantId, companyId: s.company, projectId: s.projectId, supplierContactId: contactId, supplierInvoiceId: inv.id, payableId: debt.id, accountId: accounts.get(`${s.company}:${currency}`)!, paymentDate: options.date ?? day, currency, amount: 10, amountArs: new Prisma.Decimal(10).mul(fxRate).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP), fxRate, status: "CONFIRMED" } });
  }

  async function subcontract(s: Scope, options: { currency?: string; status?: "ACTIVE" | "COMPLETED" } = {}) {
    return prisma.subcontract.create({ data: { tenantId, companyId: s.company, projectId: s.projectId, subcontractorContactId: contactId, number: ++documentNumber, title: "Synthetic closure subcontract", contractDate: older, currency: options.currency ?? s.currency, status: options.status ?? "ACTIVE", lines: { create: { wbsNodeId: s.wbsId, description: "Synthetic closure sub-item", unit: "un", quantity: 1, unitPrice: 100, lineTotal: 100 } } }, include: { lines: true } });
  }

  async function subCertification(s: Scope, contract: Awaited<ReturnType<typeof subcontract>>, date = day) {
    return prisma.subcontractCertification.create({ data: { tenantId, companyId: s.company, projectId: s.projectId, subcontractorContactId: contactId, subcontractId: contract.id, number: ++documentNumber, periodStart: date, periodEnd: date, certificationDate: date, status: "APPROVED", lines: { create: { subcontractLineId: contract.lines[0]!.id, previousQty: 0, currentQty: "0.5", cumulativeQty: "0.5", remainingQty: "0.5", unitPriceSnapshot: 100, lineTotal: 50 } } } });
  }

  async function consumption(s: Scope, options: { quantity?: string; unitCost?: string | null; totalCost?: string | null; date?: Date; unallocated?: boolean } = {}) {
    return prisma.stockMovement.create({ data: { tenantId, companyId: s.company, projectId: s.projectId, wbsNodeId: options.unallocated ? null : s.wbsId, warehouseId: s.company === companyId ? warehouseId : otherWarehouseId, productId, type: "OUT", sourceType: "CONSUMPTION", movementDate: options.date ?? day, quantity: options.quantity ?? "3.1250", unitCost: options.unitCost, totalCost: options.totalCost, status: "CONFIRMED" } });
  }

  async function report(s: Scope, filters: CostControlFilters = {}, context = ctx) {
    const result = await getProjectCostControl(s.projectId, { ...filters, budgetId: s.budgetId }, context);
    assert.equal(result.type, "REPORT");
    if (result.type !== "REPORT") throw new Error("Expected an explicitly selected budget report");
    return result;
  }

  async function materials(s: Scope, filters: CostControlFilters = {}, context = ctx) {
    const result = await getMaterialVarianceReport(s.projectId, { budgetId: s.budgetId, dateFrom: filters.dateFrom, dateTo: filters.dateTo }, context);
    assert.equal(result.type, "REPORT");
    if (result.type !== "REPORT") throw new Error("Expected an explicitly selected material report");
    return result;
  }

  async function rejectsMoney(s: Scope, filters: CostControlFilters = {}) {
    await assert.rejects(() => report(s, filters), currencyRejected);
    await assert.rejects(() => getWbsItemCostDetail(s.wbsId, s.projectId, filters, ctx), currencyRejected);
  }

  async function withModuleDisabled(moduleKey: "AP" | "SUBCONTRACTS" | "INVENTORY", run: () => Promise<void>) {
    try {
      await prisma.tenantModuleSetting.create({ data: { tenantId, moduleKey, isEnabled: false } });
      await run();
    } finally { await prisma.tenantModuleSetting.deleteMany({ where: { tenantId, moduleKey } }); }
  }

  it("keeps USD budget, order, invoice and payment values native without applying their ARS snapshots", async () => {
    const s = await scope({ currency: "USD" }), po = await order(s), inv = await invoice(s, { order: po, amount: "40" });
    await payment(s, inv);
    const cc = await report(s);
    assert.equal(cc.currency, "USD");
    assert.equal(cc.totals.committedCost, "100.00"); assert.equal(cc.totals.accruedCost, "40.00"); assert.equal(cc.totals.paidCost, "10.00");
    assert.equal(cc.totals.openCommittedCost, "60.00"); assert.equal(cc.totals.expectedCostExposure, "100.00"); assert.equal(cc.totals.costVariance, "900.00");
    const detail = await getWbsItemCostDetail(s.wbsId, s.projectId, {}, ctx);
    assert.equal(detail.currency, "USD"); assert.equal(detail.purchaseOrderLines[0]!.unitPrice, "100.0000");
    assert.equal(detail.supplierInvoices[0]!.totalAmount, "40.00"); assert.equal(detail.payments[0]!.amount, "10.00");
  });

  it("rejects a contributing purchase order in another currency in both grid and detail", async () => {
    const s = await scope(); await order(s, { currency: "USD" }); await rejectsMoney(s);
  });

  it("rejects a contributing direct invoice in another currency", async () => {
    const s = await scope(); await invoice(s, { currency: "USD" }); await rejectsMoney(s);
  });

  it("rejects NC and ND currencies with valid same-currency older invoice parents", async () => {
    for (const kind of ["CREDIT_NOTE", "DEBIT_NOTE"] as const) {
      const s = await scope(), parent = await invoice(s, { currency: "USD", date: older });
      await invoice(s, { currency: "USD", kind, parentId: parent.id, amount: "20" });
      await rejectsMoney(s, period);
    }
  });

  it("checks currency for invoice line links and the documented PO-header fallback", async () => {
    for (const allocation of ["line", "header"] as const) {
      const s = await scope(), po = await order(s, { date: older });
      await invoice(s, { currency: "USD", order: po, allocation, amount: "40" });
      await rejectsMoney(s, period);
    }
  });

  it("rejects an active contributing subcontract in another currency", async () => {
    const s = await scope(); await subcontract(s, { currency: "USD" }); await rejectsMoney(s);
  });

  it("inherits the currency of an approved certification's completed subcontract", async () => {
    const s = await scope(), contract = await subcontract(s, { currency: "USD", status: "COMPLETED" });
    await subCertification(s, contract); await rejectsMoney(s);
  });

  it("rejects an assigned payment's own currency even when its invoice predates the report", async () => {
    const s = await scope(), inv = await invoice(s, { date: older }); await payment(s, inv, { currency: "USD" });
    await rejectsMoney(s, period);
  });

  it("rejects an unassigned payment's currency even when its invoice predates the report", async () => {
    const s = await scope(), inv = await invoice(s, { date: older, allocation: "none" }); await payment(s, inv, { currency: "USD" });
    await assert.rejects(() => report(s, period), currencyRejected);
  });

  it("shows a November payment in grid and detail when its invoice was issued in October", async () => {
    const s = await scope(), inv = await invoice(s, { date: older }), paid = await payment(s, inv);
    const cc = await report(s, period); assert.equal(cc.totals.accruedCost, "0.00"); assert.equal(cc.totals.paidCost, "10.00");
    const detail = await getWbsItemCostDetail(s.wbsId, s.projectId, period, ctx);
    assert.equal(detail.supplierInvoices.length, 0); assert.equal(detail.payments.length, 1);
    assert.equal(detail.payments[0]!.paymentId, paid.id); assert.equal(detail.payments[0]!.invoiceId, inv.id);
    assert.equal(detail.payments[0]!.paymentDate.toISOString().slice(0, 10), "2026-11-04");
  });

  it("does not block or allocate sources from another company or another selected budget", async () => {
    const s = await scope();
    for (const sourceCompany of [companyId, otherCompanyId]) {
      const other = await scope({ projectId: s.projectId, parentBudgetId: s.budgetId, company: sourceCompany, currency: "USD" });
      const po = await order(other), inv = await invoice(other, { order: po }); await payment(other, inv);
    }
    const cc = await report(s);
    assert.equal(cc.totals.committedCost, "0.00"); assert.equal(cc.totals.accruedCost, "0.00"); assert.equal(cc.totals.paidCost, "0.00");
    assert.equal(cc.unallocatedCommittedCost, "0.00"); assert.equal(cc.unallocatedAccruedCost, "0.00"); assert.equal(cc.unallocatedPaidCost, "0.00");
  });

  it("does not block on mismatched orders, invoices or payments outside the selected period", async () => {
    const s = await scope(), po = await order(s, { currency: "USD", date: older }), inv = await invoice(s, { currency: "USD", date: older, order: po });
    await payment(s, inv, { date: older });
    const cc = await report(s, period); assert.equal(cc.totals.expectedCostExposure, "0.00"); assert.equal(cc.totals.paidCost, "0.00");
  });

  it("checks contributing WBS search results before comparing source currencies", async () => {
    const s = await scope(), other = await addWbs(s, "2", "Excluded closure item");
    await order(s); const po = await order(other, { currency: "USD" }), inv = await invoice(other, { currency: "USD", order: po }); await payment(other, inv);
    const cc = await report(s, { wbsSearch: "Closure selected" });
    assert.equal(cc.rows.length, 1); assert.equal(cc.rows[0]!.wbsNodeId, s.wbsId); assert.equal(cc.totals.expectedCostExposure, "100.00");
    await assert.rejects(() => report(s), currencyRejected);
  });

  it("keeps exact detail layers calculable despite another WBS and unassigned USD cost in the same budget", async () => {
    const s = await scope(), other = await addWbs(s, "2", "Other currency item");
    await order(s); await order(other, { currency: "USD" }); await invoice(s, { currency: "USD", allocation: "none" });
    await assert.rejects(() => report(s), currencyRejected);
    const detail = await getWbsItemCostDetail(s.wbsId, s.projectId, {}, ctx);
    assert.equal(detail.purchaseOrderLines.length, 1);
    assert.equal(detail.byCostType.find((row) => row.costType === "MATERIAL")?.expectedCostExposure, "100.00");
    assert.equal(detail.progressSummary.expectedExposurePctOfCost, "10.00");
    assert.ok(!detail.warnings.some((warning) => /documentos en USD/.test(warning)));
  });

  it("does not read or reject AP currency when that source module is disabled", async () => {
    const s = await scope(); await invoice(s, { currency: "USD" });
    await withModuleDisabled("AP", async () => {
      const cc = await report(s); assert.equal(cc.totals.accruedCost, "0.00"); assert.equal(cc.totals.expectedCostExposure, "0.00");
      assert.ok(cc.sectionsExcluded.some((section) => section.module === "AP"));
      const detail = await getWbsItemCostDetail(s.wbsId, s.projectId, {}, ctx); assert.equal(detail.supplierInvoices.length, 0); assert.equal(detail.payments.length, 0);
    });
  });

  it("does not read AP amounts or identifiers for a project viewer", async () => {
    const s = await scope(), inv = await invoice(s, { currency: "USD" }); await payment(s, inv);
    assert.equal(can(viewer.roles, "VIEW", "AP"), false);
    const cc = await report(s, {}, viewer); assert.equal(cc.totals.accruedCost, "0.00"); assert.equal(cc.totals.paidCost, "0.00");
    assert.ok(cc.warnings.some((warning) => warning.includes("AP")));
    const detail = await getWbsItemCostDetail(s.wbsId, s.projectId, {}, viewer); assert.equal(detail.supplierInvoices.length, 0); assert.equal(detail.payments.length, 0);
  });

  it("routes an older Budget B USD subcert payment to its true parent instead of unassigned Budget A ARS", async () => {
    const s = await scope(), other = await scope({ projectId: s.projectId, parentBudgetId: s.budgetId, currency: "USD" });
    const contract = await subcontract(other), cert = await subCertification(other, contract, older);
    const inv = await invoice(other, { date: older, subCertId: cert.id, amount: "50" }); await payment(other, inv);
    const cc = await report(s, period);
    assert.equal(cc.totals.paidCost, "0.00"); assert.equal(cc.unallocatedPaidCost, "0.00"); assert.equal(cc.totals.expectedCostExposure, "0.00");
  });

  it("keeps AP-origin subcert payments visible outside accrual dates and without the subcontract source", async () => {
    const s = await scope(), contract = await subcontract(s), cert = await subCertification(s, contract, older);
    const inv = await invoice(s, { date: older, subCertId: cert.id, amount: "50" }), paid = await payment(s, inv);
    assert.equal(can(projectFinance.roles, "VIEW", "SUBCONTRACTS"), false); assert.equal(can(projectFinance.roles, "VIEW", "AP"), true);
    const restricted = await report(s, period, projectFinance); assert.equal(restricted.totals.paidCost, "10.00"); assert.equal(restricted.unallocatedPaidCost, "0.00");
    await withModuleDisabled("SUBCONTRACTS", async () => {
      const cc = await report(s, period); assert.equal(cc.totals.committedCost, "0.00"); assert.equal(cc.totals.accruedCost, "0.00"); assert.equal(cc.totals.paidCost, "10.00"); assert.equal(cc.unallocatedPaidCost, "0.00");
      const detail = await getWbsItemCostDetail(s.wbsId, s.projectId, period, ctx); assert.equal(detail.subcontractLines.length, 0); assert.equal(detail.payments[0]!.paymentId, paid.id);
      assert.ok(detail.warnings.some((warning) => warning.includes("Subcontratos") || warning.includes("SUBCONTRACTS")));
    });
  });

  it("reports zero only after confirming that no consumption exists in the accessible scope", async () => {
    const s = await scope(), cc = await report(s), mat = await materials(s);
    assert.equal(cc.rows[0]!.inventoryConsumedCost, "0.00"); assert.equal(cc.totals.inventoryConsumedCost, "0.00"); assert.equal(cc.unallocatedInventoryConsumedCost, "0.00");
    assert.equal(mat.byWbs[0]!.consumedCost, "0.00"); assert.equal(mat.byWbs[0]!.variance, "700.00"); assert.equal(mat.byWbs[0]!.variancePct, "100.00");
    assert.equal(mat.totals.consumedCost, "0.00"); assert.equal(mat.totals.variance, "700.00");
    assert.ok(!cc.warnings.includes(STOCK_CONSUMPTION_UNVALUED_WARNING));
  });

  it("preserves quantities and null costs, variance and percentages for an unvalued consumption", async () => {
    const s = await scope(), movement = await consumption(s), beforeRead = await prisma.stockMovement.findUniqueOrThrow({ where: { id: movement.id } });
    const cc = await report(s), row = cc.rows[0]!, mat = await materials(s);
    assert.equal(row.qtyConsumed, "3.1250"); assert.equal(row.inventoryConsumedCost, null); assert.equal(cc.totals.inventoryConsumedCost, null);
    assert.equal(row.byCostType.find((bucket) => bucket.costType === "MATERIAL")!.inventoryConsumedCost, null);
    assert.equal(mat.byWbs[0]!.consumedCost, null); assert.equal(mat.byWbs[0]!.variance, null); assert.equal(mat.byWbs[0]!.variancePct, null);
    assert.equal(mat.totals.consumedCost, null); assert.equal(mat.totals.variance, null); assert.ok(mat.warnings.includes(STOCK_CONSUMPTION_UNVALUED_WARNING));
    const detail = await getWbsItemCostDetail(s.wbsId, s.projectId, {}, ctx);
    assert.equal(detail.stockMovements[0]!.quantity, "3.1250"); assert.equal(detail.stockMovements[0]!.unitCost, null); assert.equal(detail.stockMovements[0]!.totalCost, null);
    assert.ok(detail.warnings.includes(STOCK_CONSUMPTION_UNVALUED_WARNING));
    assert.deepEqual(await prisma.stockMovement.findUniqueOrThrow({ where: { id: movement.id } }), beforeRead);
  });

  it("does not treat legacy zero or positive prices as currency and valuation lineage", async () => {
    for (const value of ["0", "15.4321"]) {
      const s = await scope(), movement = await consumption(s, { unitCost: value, totalCost: new Prisma.Decimal(value).mul("3.125").toFixed(4) });
      const snapshot = await prisma.stockMovement.findUniqueOrThrow({ where: { id: movement.id } });
      const cc = await report(s), mat = await materials(s), detail = await getWbsItemCostDetail(s.wbsId, s.projectId, {}, ctx);
      assert.equal(cc.rows[0]!.inventoryConsumedCost, null); assert.equal(mat.totals.consumedCost, null);
      assert.equal(detail.stockMovements[0]!.unitCost, null); assert.equal(detail.stockMovements[0]!.totalCost, null);
      assert.deepEqual(await prisma.stockMovement.findUniqueOrThrow({ where: { id: movement.id } }), snapshot);
    }
  });

  it("keeps a mixed known-zero and unknown consumption total unknown", async () => {
    const s = await scope(), other = await addWbs(s, "2", "Known empty item"); await consumption(s);
    const cc = await report(s), mat = await materials(s);
    assert.equal(cc.rows.find((row) => row.wbsNodeId === s.wbsId)!.inventoryConsumedCost, null);
    assert.equal(cc.rows.find((row) => row.wbsNodeId === other.wbsId)!.inventoryConsumedCost, "0.00"); assert.equal(cc.totals.inventoryConsumedCost, null);
    assert.equal(mat.byWbs.find((row) => row.wbsNodeId === other.wbsId)!.variance, "700.00");
    assert.equal(mat.totals.budgetMaterial, "1400.00"); assert.equal(mat.totals.consumedCost, null); assert.equal(mat.totals.variance, null);
  });

  it("does not mark consumption unknown because of another company, budget or date", async () => {
    const s = await scope();
    const otherBudget = await scope({ projectId: s.projectId, parentBudgetId: s.budgetId });
    const otherCompany = await scope({ projectId: s.projectId, parentBudgetId: s.budgetId, company: otherCompanyId });
    await consumption(otherBudget); await consumption(otherCompany); await consumption(s, { date: older });
    const cc = await report(s, period), mat = await materials(s, period);
    assert.equal(cc.totals.inventoryConsumedCost, "0.00"); assert.equal(cc.rows[0]!.qtyConsumed, "0.0000"); assert.equal(cc.unallocatedInventoryConsumedCost, "0.00");
    assert.equal(mat.totals.consumedCost, "0.00"); assert.equal(mat.totals.variance, "700.00"); assert.ok(!mat.warnings.includes(STOCK_CONSUMPTION_UNVALUED_WARNING));
  });

  it("keeps unavailable inventory unknown instead of claiming a zero consumption", async () => {
    const s = await scope();
    await withModuleDisabled("INVENTORY", async () => {
      const cc = await report(s), mat = await materials(s), detail = await getWbsItemCostDetail(s.wbsId, s.projectId, {}, ctx);
      assert.equal(cc.totals.inventoryConsumedCost, null); assert.equal(cc.rows[0]!.inventoryConsumedCost, null); assert.equal(cc.unallocatedInventoryConsumedCost, null);
      assert.equal(mat.byWbs[0]!.consumedCost, null); assert.equal(mat.byWbs[0]!.variance, null); assert.equal(mat.totals.consumedCost, null);
      assert.ok(cc.warnings.includes(STOCK_CONSUMPTION_UNAVAILABLE_WARNING)); assert.ok(mat.warnings.includes(STOCK_CONSUMPTION_UNAVAILABLE_WARNING)); assert.ok(detail.warnings.includes(STOCK_CONSUMPTION_UNAVAILABLE_WARNING));
    });
  });

  it("keeps project-viewer consumption costs unknown when the inventory source is not readable", async () => {
    const s = await scope(); assert.equal(can(viewer.roles, "VIEW", "INVENTORY"), false);
    const cc = await report(s, {}, viewer), mat = await materials(s, {}, viewer);
    assert.equal(cc.totals.inventoryConsumedCost, null); assert.equal(mat.byWbs[0]!.consumedCost, null); assert.equal(mat.byWbs[0]!.variance, null); assert.equal(mat.totals.variance, null);
    assert.ok(cc.warnings.includes(STOCK_CONSUMPTION_UNAVAILABLE_WARNING));
  });

  it("preserves an unassigned consumption as unknown and warns without assigning it to a WBS", async () => {
    const s = await scope(); await consumption(s, { unallocated: true, unitCost: "10", totalCost: "31.25" });
    const cc = await report(s); assert.equal(cc.unallocatedInventoryConsumedCost, null); assert.equal(cc.rows[0]!.inventoryConsumedCost, "0.00"); assert.equal(cc.rows[0]!.qtyConsumed, "0.0000");
    assert.ok(cc.warnings.includes(STOCK_CONSUMPTION_UNVALUED_WARNING));
  });

  it("keeps documentary exposure and its variance independent of unvalued stock consumption", async () => {
    const s = await scope(), po = await order(s); await invoice(s, { order: po, amount: "40" }); await consumption(s, { unitCost: "500", totalCost: "1562.50" });
    const cc = await report(s), row = cc.rows[0]!;
    assert.equal(row.inventoryConsumedCost, null); assert.equal(row.accruedCost, "40.00"); assert.equal(row.openCommittedCost, "60.00"); assert.equal(row.expectedCostExposure, "100.00"); assert.equal(row.costVariance, "900.00");
    assert.equal(cc.totals.expectedCostExposure, "100.00"); assert.equal(cc.totals.costVariance, "900.00");
  });

  it("propagates nullable informational consumed cost into the certification measurement sheet", async () => {
    const s = await scope(); await consumption(s);
    const cert = await prisma.certification.create({ data: { tenantId, companyId, projectId: s.projectId, budgetId: s.budgetId, number: ++documentNumber, periodStart: day, periodEnd: day, status: "DRAFT" } });
    const snapshot = await prisma.certification.findUniqueOrThrow({ where: { id: cert.id } });
    const sheet = await getCertificationMeasurementSheet(cert.id, ctx), row = sheet.rows.find((entry) => entry.wbsNodeId === s.wbsId)!;
    assert.equal(sheet.costAvailable, true); assert.equal(row.cost!.consumedCost, null); assert.equal(row.cost!.committedCost, "0.00");
    assert.equal(row.budgetQty, "1.0000"); assert.deepEqual(await prisma.certification.findUniqueOrThrow({ where: { id: cert.id } }), snapshot);
  });

  it("keeps D-123 net resource quantities available while D-122 blocks money and D-124 keeps stock valuation unknown", async () => {
    const s = await scope(), parent = await invoice(s, { currency: "USD", quantity: "10", apuId: s.laborId, costType: "LABOR" });
    await invoice(s, { currency: "USD", kind: "CREDIT_NOTE", parentId: parent.id, quantity: "2", amount: "20", apuId: s.laborId, costType: "LABOR" });
    await invoice(s, { currency: "USD", kind: "DEBIT_NOTE", parentId: parent.id, quantity: "1", amount: "10", apuId: s.laborId, costType: "LABOR" });
    await consumption(s, { unitCost: "0", totalCost: "0" });
    const board = await getProjectResourceBoard(s.projectId, "LABOR", { budgetId: s.budgetId, window: "all" }, ctx);
    assert.equal(board.type, "REPORT"); if (board.type !== "REPORT") return;
    assert.equal(board.rows[0]!.invoicedQty, "9.0000"); assert.equal(board.rows[0]!.shortfallQty, "3.0000");
    await assert.rejects(() => report(s), currencyRejected);
    const mat = await materials(s); assert.equal(mat.totals.consumedCost, null); assert.equal(mat.totals.variance, null);
  });

  it("keeps temporal planning and a real XLSX usable when contributing currency blocks cost control", async () => {
    const s = await scope(); await order(s, { currency: "USD" });
    await assert.rejects(() => report(s), currencyRejected);
    const task = await createScheduleItem(s.projectId, {
      name: "Independent task with incompatible purchase currency", type: "TASK", startDate: "2026-11-04", endDate: "2026-11-09",
    }, ctx);
    const workspace = await getProjectScheduleWorkspace(s.projectId, { budgetId: s.budgetId }, ctx);
    assert.equal(workspace.type, "WORKSPACE"); if (workspace.type !== "WORKSPACE") return;
    const row = workspace.items.find((item) => item.id === task.id)!;
    assert.equal(row.name, task.name); assert.equal(row.startDate, "2026-11-04"); assert.equal(row.endDate, "2026-11-09"); assert.equal(row.metrics, null);
    assert.equal(workspace.canEdit, true); assert.match(workspace.metricsWarning ?? "", /moneda/i);
    assert.match(workspace.metricsWarning ?? "", /USD/);

    const exported = await exportScheduleXlsx(s.projectId, { budgetId: s.budgetId, view: "table" }, ctx);
    assert.ok(exported.buffer.length > 500);
    const workbook = XLSX.read(exported.buffer, { type: "buffer" });
    assert.equal(workbook.SheetNames.length, 1);
    const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[workbook.SheetNames[0]!]!, { header: 1, raw: false });
    const exportedTask = rows.find((cells) => cells[0] === task.name)!;
    assert.ok(exportedTask); assert.equal(exportedTask[4], "04/11/2026"); assert.equal(exportedTask[5], "09/11/2026");
    assert.equal(exportedTask[11], "—"); assert.equal(exportedTask[12], "—");
    assert.ok(rows.some((cells) => cells[0] === "Resumen" && /moneda/i.test(cells[1] ?? "")));
  });

  it("honors invoice line attribution ahead of a mixed PO header in WBS detail", async () => {
    for (const currency of ["ARS", "USD"]) {
      const s = await scope(), other = await addWbs(s, "2", "Header mapped other item"), po = await order(s);
      const otherLine = await prisma.purchaseOrderLine.create({ data: {
        purchaseOrderId: po.id, wbsNodeId: other.wbsId, costAnalysisLineId: other.materialId, costType: "MATERIAL",
        description: "Other WBS on the mixed purchase order", unit: "un", quantity: 1, unitPrice: 60, lineSubtotal: 60, lineTotal: 60,
      } });
      await prisma.purchaseOrder.update({ where: { id: po.id }, data: { subtotal: 160, totalAmount: 160, totalAmountArs: 160 } });
      // Only the PO-line FK attributes this legacy invoice; it does not name WBS A.
      const inv = await invoice(other, { currency, order: po, purchaseOrderLineId: otherLine.id, directWbs: false, amount: "40" });
      const selected = await report(s, { wbsSearch: "Closure selected" });
      assert.equal(selected.rows[0]!.accruedCost, "0.00"); assert.equal(selected.totals.accruedCost, "0.00");
      const detailA = await getWbsItemCostDetail(s.wbsId, s.projectId, {}, ctx);
      assert.equal(detailA.supplierInvoices.length, 0);
      assert.equal(detailA.byCostType.find((bucket) => bucket.costType === "MATERIAL")!.accruedCost, "0.00");
      assert.equal(detailA.progressSummary.accruedPctOfCost, "0.00");
      assert.ok(!detailA.warnings.some((warning) => warning.includes("USD")));
      if (currency === "ARS") {
        const cc = await report(s);
        assert.equal(cc.rows.find((row) => row.wbsNodeId === s.wbsId)!.accruedCost, "0.00");
        assert.equal(cc.rows.find((row) => row.wbsNodeId === other.wbsId)!.accruedCost, "40.00");
        const detailB = await getWbsItemCostDetail(other.wbsId, s.projectId, {}, ctx);
        assert.equal(detailB.supplierInvoices.length, 1); assert.equal(detailB.supplierInvoices[0]!.invoiceId, inv.id);
        assert.equal(detailB.byCostType.find((bucket) => bucket.costType === "MATERIAL")!.accruedCost, "40.00");
      } else {
        await assert.rejects(() => report(s), currencyRejected);
        await assert.rejects(() => getWbsItemCostDetail(other.wbsId, s.projectId, {}, ctx), currencyRejected);
      }
    }
  });

  it("ignores a foreign budget's zero-net PO header before the unassigned accrual fallback", async () => {
    const s = await scope(), other = await scope({ projectId: s.projectId, parentBudgetId: s.budgetId, currency: "USD" });
    const po = await order(other, { amount: "0" });
    await invoice(other, { order: po, allocation: "header", amount: "100" });
    const cc = await report(s);
    assert.equal(cc.totals.accruedCost, "0.00"); assert.equal(cc.unallocatedAccruedCost, "0.00");
    assert.equal(cc.totals.expectedCostExposure, "0.00");
    const detail = await getWbsItemCostDetail(s.wbsId, s.projectId, {}, ctx);
    assert.equal(detail.supplierInvoices.length, 0);
    assert.equal(detail.byCostType.find((bucket) => bucket.costType === "MATERIAL")!.accruedCost, "0.00");
    assert.ok(!detail.warnings.some((warning) => warning.includes("USD")));
  });
});
