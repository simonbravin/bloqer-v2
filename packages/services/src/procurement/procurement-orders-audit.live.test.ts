/** Maintained AG-06 integration checks. Explicit isolated DB guard runs before writes. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { Prisma, prisma, type PurchaseOrderStatus } from "@bloqer/database";

import { assertAuditDatabaseIdentity } from "../testing/audit-fixture";
import { clearProjectAccessModeCache } from "../security/access";
import { ServiceError, type ServiceContext } from "../types";
import { getStockBalance } from "../inventory/stock-balance.service";
import { updateProduct, getProductById } from "../inventory/product.service";
import { budgetBaselineForPurchaseLine } from "./procurement-budget-baseline";
import { createProcurementQuote } from "./procurement-quote.service";
import { createPurchaseRequest, submitPurchaseRequest } from "./purchase-request.service";
import { createPurchaseOrderFromQuoteLines } from "./purchase-request-to-po.service";
import { createPurchaseOrdersFromAwards } from "./purchase-request-to-po.service";
import { calcLine } from "./purchase-order-calc.service";
import { approvePurchaseOrder, confirmPurchaseOrder, returnPurchaseOrder, submitPurchaseOrder } from "./purchase-order-workflow.service";
import { cancelPurchaseOrder, createPurchaseOrder, getPurchaseOrderById, listLinkablePurchaseOrders, listProcurementWbsOptions, listPurchaseOrdersByProject, updatePurchaseOrder } from "./purchase-order.service";
import { cancelPurchaseReceipt, confirmPurchaseReceipt, countActiveDraftReceiptsForPo, createPurchaseReceipt, findActiveDraftReceiptId, getPoLinesForReceiptForm, getPurchaseReceiptById, listReceiptsByProject, updatePurchaseReceipt } from "./purchase-receipt.service";

const isConflict = (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT";
const denied = (error: unknown) => error instanceof ServiceError && ["NOT_FOUND", "FORBIDDEN"].includes(error.code);
const live = process.env.BLOQER_AUDIT_LIVE === "1";

describe("AG-06 OC and receipts: isolated SQL scope, currency and physical integrity", { skip: !live, concurrency: false }, () => {
  const tenantId = randomUUID(), foreignTenantId = randomUUID(), companyId = randomUUID(), otherCompanyId = randomUUID(), foreignCompanyId = randomUUID();
  const actorId = randomUUID(), secondActorId = randomUUID(), pmId = randomUUID(), contactId = randomUUID();
  const productId = randomUUID(), otherProductId = randomUUID(), foreignProductId = randomUUID(), warehouseId = randomUUID(), foreignWarehouseId = randomUUID();
  const ctx: ServiceContext = { tenantId, companyId, actorUserId: actorId, roles: ["OWNER"] };
  const global: ServiceContext = { ...ctx, companyId: null, actorUserId: secondActorId };
  const other: ServiceContext = { ...ctx, companyId: otherCompanyId };
  const foreign: ServiceContext = { ...ctx, tenantId: foreignTenantId, companyId: foreignCompanyId };
  const pm: ServiceContext = { ...ctx, actorUserId: pmId, roles: ["PROJECT_MANAGER"] };
  const day = new Date("2026-11-04T00:00:00.000Z"), date = "2026-11-04";
  let verified = false;

  before(async () => {
    await assertAuditDatabaseIdentity(prisma); verified = true; clearProjectAccessModeCache();
    await prisma.$transaction(async (tx) => {
      await tx.tenant.createMany({ data: [tenantId, foreignTenantId].map((id) => ({ id, slug: `audit-orders-${id}`, name: "Synthetic AG06 orders", projectAccessMode: "MEMBERSHIP_SCOPED" as const })) });
      await tx.company.createMany({ data: [{ id: companyId, tenantId, name: "Synthetic company A" }, { id: otherCompanyId, tenantId, name: "Synthetic company B" }, { id: foreignCompanyId, tenantId: foreignTenantId, name: "Synthetic foreign company" }] });
      await tx.user.createMany({ data: [actorId, secondActorId, pmId].map((id) => ({ id, email: `audit-orders-${id}@example.test`, name: "Synthetic audit actor", status: "ACTIVE" as const })) });
      await tx.userMembership.createMany({ data: [
        { tenantId, companyId, userId: actorId, roles: ["OWNER"] }, { tenantId, companyId: null, userId: secondActorId, roles: ["OWNER"] },
        { tenantId, companyId, userId: pmId, roles: ["PROJECT_MANAGER"] }, { tenantId: foreignTenantId, companyId: foreignCompanyId, userId: actorId, roles: ["OWNER"] },
      ] });
      await tx.contact.create({ data: { id: contactId, tenantId, legalName: "Synthetic AG06 counterparty", roles: { create: [{ tenantId, role: "CLIENT" }, { tenantId, role: "SUPPLIER" }] } } });
      await tx.companyProcurementSettings.createMany({ data: [companyId, otherCompanyId].map((id) => ({ companyId: id, minQuotesRequired: 1, allowSelfApproval: true, poApprovalThresholdArs: "100000000", purchaseRequestRequiredAboveArs: "100000000", apPaymentNotificationChannel: "IN_APP" as const })) });
      await tx.product.createMany({ data: [{ id: productId, tenantId, companyId: null, sku: `AG06-${productId}`, name: "Synthetic shared material", unit: "un" }, { id: otherProductId, tenantId, companyId: otherCompanyId, sku: `AG06-${otherProductId}`, name: "Synthetic other company material", unit: "un" }, { id: foreignProductId, tenantId: foreignTenantId, companyId: foreignCompanyId, sku: `AG06-${foreignProductId}`, name: "Synthetic foreign material", unit: "un" }] });
      await tx.warehouse.createMany({ data: [{ id: warehouseId, tenantId, companyId, name: "Synthetic AG06 warehouse" }, { id: foreignWarehouseId, tenantId: foreignTenantId, companyId: foreignCompanyId, name: "Synthetic foreign warehouse" }] });
    }, { maxWait: 10_000, timeout: 90_000 });
  });

  after(async () => {
    clearProjectAccessModeCache();
    if (!verified) return;
    try {
      const tenants = { in: [tenantId, foreignTenantId] };
      await prisma.$transaction(async (tx) => {
        await tx.stockMovement.deleteMany({ where: { tenantId: tenants } });
        await tx.supplierInvoiceLine.deleteMany({ where: { invoice: { tenantId: tenants } } });
        await tx.supplierInvoice.deleteMany({ where: { tenantId: tenants } });
        await tx.purchaseReceiptLine.deleteMany({ where: { purchaseReceipt: { tenantId: tenants } } });
        await tx.purchaseReceipt.deleteMany({ where: { tenantId: tenants } });
        await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrder: { tenantId: tenants } } });
        await tx.purchaseOrder.deleteMany({ where: { tenantId: tenants } });
        await tx.procurementQuoteLine.deleteMany({ where: { procurementQuote: { tenantId: tenants } } });
        await tx.procurementQuote.deleteMany({ where: { tenantId: tenants } });
        await tx.purchaseRequestLine.deleteMany({ where: { purchaseRequest: { tenantId: tenants } } });
        await tx.purchaseRequest.deleteMany({ where: { tenantId: tenants } });
        await tx.emailDeliveryLog.deleteMany({ where: { tenantId: tenants } });
        await tx.notification.deleteMany({ where: { tenantId: tenants } });
        await tx.auditLog.deleteMany({ where: { tenantId: tenants } });
        await tx.costAnalysisLine.deleteMany({ where: { budget: { tenantId: tenants } } });
        await tx.costItem.deleteMany({ where: { budget: { tenantId: tenants } } });
        await tx.wbsNode.deleteMany({ where: { budget: { tenantId: tenants } } });
        await tx.budget.deleteMany({ where: { tenantId: tenants } });
        await tx.projectMembership.deleteMany({ where: { tenantId: tenants } });
        await tx.project.deleteMany({ where: { tenantId: tenants } });
        await tx.warehouse.deleteMany({ where: { tenantId: tenants } });
        await tx.product.deleteMany({ where: { tenantId: tenants } });
        await tx.contactRole.deleteMany({ where: { tenantId: tenants } });
        await tx.contact.deleteMany({ where: { tenantId: tenants } });
        await tx.companyProcurementSettings.deleteMany({ where: { companyId: { in: [companyId, otherCompanyId, foreignCompanyId] } } });
        await tx.tenantModuleSetting.deleteMany({ where: { tenantId: tenants } });
        await tx.userMembership.deleteMany({ where: { tenantId: tenants } });
        await tx.company.deleteMany({ where: { tenantId: tenants } });
        await tx.tenant.deleteMany({ where: { id: tenants } });
        await tx.user.deleteMany({ where: { id: { in: [actorId, secondActorId, pmId] } } });
      }, { maxWait: 10_000, timeout: 90_000 });
    } finally { await prisma.$disconnect(); }
  });

  type Scope = { projectId: string; budgetId: string; wbsId: string; materialId: string; laborId: string; companyId: string; currency: string };
  async function scope(options: { projectId?: string; companyId?: string; currency?: string; unit?: string } = {}): Promise<Scope> {
    const projectId = options.projectId ?? randomUUID(), budgetId = randomUUID(), wbsId = randomUUID(), itemId = randomUUID(), materialId = randomUUID(), laborId = randomUUID(), company = options.companyId ?? companyId, currency = options.currency ?? "ARS";
    await prisma.$transaction(async (tx) => {
      if (!options.projectId) await tx.project.create({ data: { id: projectId, tenantId, companyId: null, clientContactId: contactId, name: "Synthetic AG06 shared project", code: randomUUID(), country: "AR", status: "ACTIVE" } });
      const principal = await tx.budget.findFirst({ where: { tenantId, projectId, parentBudgetId: null }, select: { id: true } });
      const latest = await tx.budget.aggregate({ where: { projectId }, _max: { versionNumber: true } });
      await tx.budget.create({ data: { id: budgetId, tenantId, companyId: company, projectId, parentBudgetId: principal?.id ?? null, name: "Synthetic AG06 budget", versionNumber: (latest._max.versionNumber ?? 0) + 1, currency, status: "APPROVED" } });
      await tx.wbsNode.create({ data: { id: wbsId, budgetId, code: "1", name: "Synthetic AG06 item", type: "ITEM" } });
      await tx.costItem.create({ data: { id: itemId, budgetId, wbsNodeId: wbsId, unit: options.unit ?? "m2", quantity: 10, unitCostDirect: 30, totalCostDirect: 300, unitSalePrice: 40, totalSalePrice: 400 } });
      await tx.costAnalysisLine.createMany({ data: [{ id: materialId, budgetId, costItemId: itemId, category: "MATERIAL", description: "Synthetic material", productId, unit: "un", coefficient: 1, unitCost: 10, totalCost: 10 }, { id: laborId, budgetId, costItemId: itemId, category: "LABOR", description: "Synthetic labor", unit: "h", coefficient: 2, unitCost: 10, totalCost: 20 }] });
    }, { timeout: 60_000 });
    return { projectId, budgetId, wbsId, materialId, laborId, companyId: company, currency };
  }
  async function order(s: Scope, options: { status?: PurchaseOrderStatus; quantity?: string; product?: boolean; productId?: string; currency?: string } = {}) {
    const qty = new Prisma.Decimal(options.quantity ?? "10"), currency = options.currency ?? s.currency;
    const calculated = calcLine(qty, new Prisma.Decimal(10), new Prisma.Decimal(0));
    const money = { lineSubtotal: calculated.lineSubtotal, lineTax: calculated.lineTax, lineTotal: calculated.lineTotal };
    const max = await prisma.purchaseOrder.aggregate({ where: { tenantId, companyId: s.companyId }, _max: { number: true } });
    return prisma.purchaseOrder.create({ data: { tenantId, companyId: s.companyId, projectId: s.projectId, supplierContactId: contactId, number: (max._max.number ?? 0) + 1, issueDate: day, status: options.status ?? "CONFIRMED", currency, fxRate: currency === "ARS" ? 1 : 100, subtotal: money.lineSubtotal, totalAmount: money.lineTotal, totalAmountArs: money.lineTotal.mul(currency === "ARS" ? 1 : 100), originRequestedByUserId: actorId, createdBy: actorId, lines: { create: { wbsNodeId: s.wbsId, costAnalysisLineId: s.materialId, productId: options.productId ?? (options.product ? productId : null), costType: "MATERIAL", description: "Synthetic order material", unit: "un", quantity: qty, unitPrice: 10, taxRate: 0, discountPct: 0, ...money } } }, include: { lines: true } });
  }
  type Order = Awaited<ReturnType<typeof order>>;
  const directInput = (s: Scope, options: { currency?: string; fxRate?: string; apu?: string; product?: string; unit?: string; justification?: string } = {}) => ({ projectId: s.projectId, supplierContactId: contactId, issueDate: date, currency: options.currency ?? s.currency, fxRate: options.fxRate, iibbPerceptionRate: "0", lines: [{ wbsNodeId: s.wbsId, costAnalysisLineId: options.apu ?? s.materialId, productId: options.product, description: "Synthetic direct material", unit: options.unit ?? "un", quantity: "1", unitPrice: "10", taxRate: "0", discountPct: "0", sortOrder: 0, varianceJustification: options.justification }] });
  async function draft(po: Order, quantities: string[], warehouse: string | null = null) {
    return createPurchaseReceipt({ purchaseOrderId: po.id, warehouseId: warehouse, receiptDate: date, idempotencyKey: randomUUID(), lines: quantities.map((quantityReceived) => ({ purchaseOrderLineId: po.lines[0]!.id, quantityReceived })) }, ctx);
  }

  async function request(s: Scope, context: ServiceContext = ctx) {
    return createPurchaseRequest({ projectId: s.projectId, neededByDate: date, lines: [{ wbsNodeId: s.wbsId, costAnalysisLineId: s.materialId, description: "Synthetic direct material", unit: "un", quantity: "1", lineType: "MATERIAL", sortOrder: 0 }] }, context);
  }

  /** Interleave at the real service transaction boundary, without timing sleeps. */
  async function interleaveAfterPreview<T>(action: () => Promise<T>, interleaving: () => Promise<unknown>): Promise<T> {
    const original = prisma.$transaction, transact = original.bind(prisma);
    let release!: () => void, reached!: () => void, intercepted = false;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const atTransaction = new Promise<void>((resolve) => { reached = resolve; });
    prisma.$transaction = (async (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options: object) => {
      if (!intercepted) { intercepted = true; reached(); await gate; }
      return transact(work, options);
    }) as typeof prisma.$transaction;
    const pending = Promise.resolve().then(action);
    try {
      await Promise.race([atTransaction, pending.then(() => { throw new Error("Expected a service transaction boundary"); })]);
      await interleaving(); release();
      return await pending;
    } finally { release(); prisma.$transaction = original; await pending.catch(() => undefined); }
  }

  it("isolates company documents on a shared project across get, list, links and receipt helpers", async () => {
    const a = await scope(), b = await scope({ projectId: a.projectId, companyId: otherCompanyId });
    const own = await order(a), hidden = await order(b), receipt = await draft(own, ["2"]);
    await assert.rejects(() => getPurchaseOrderById(hidden.id, ctx), denied);
    await assert.rejects(() => getPurchaseOrderById(own.id, other), denied);
    await assert.rejects(() => getPurchaseOrderById(own.id, foreign), denied);
    assert.deepEqual((await listPurchaseOrdersByProject(a.projectId, ctx)).map((row) => row.id), [own.id]);
    assert.deepEqual((await listLinkablePurchaseOrders(a.projectId, ctx)).map((row) => row.id), [own.id]);
    assert.ok((await listProcurementWbsOptions(a.projectId, ctx)).every((node) => node.id !== b.wbsId));
    assert.deepEqual((await listReceiptsByProject(a.projectId, other)).map((row) => row.id), []);
    await assert.rejects(() => getPurchaseReceiptById(receipt.id, other), denied);
    await assert.rejects(() => findActiveDraftReceiptId(own.id, other), denied);
    await assert.rejects(() => countActiveDraftReceiptsForPo(own.id, other), denied);
    await assert.rejects(() => getPoLinesForReceiptForm(own.id, [], other), denied);
    assert.equal((await listPurchaseOrdersByProject(a.projectId, global)).length, 2);
  });

  it("rejects foreign company WBS and product references before creating a direct OC", async () => {
    const a = await scope(), b = await scope({ projectId: a.projectId, companyId: otherCompanyId });
    await assert.rejects(() => createPurchaseOrder(directInput(b), ctx), denied);
    await assert.rejects(() => createPurchaseOrder(directInput(a, { product: otherProductId }), ctx), isConflict);
    assert.equal(await prisma.purchaseOrder.count({ where: { tenantId, projectId: a.projectId } }), 0);
  });

  it("rejects a legacy cross-company joined WBS before returning labels or using its cost", async () => {
    const a = await scope(), b = await scope({ projectId: a.projectId, companyId: otherCompanyId }), po = await order(a);
    await prisma.purchaseOrderLine.update({ where: { id: po.lines[0]!.id }, data: { wbsNodeId: b.wbsId, costAnalysisLineId: b.materialId } });
    await assert.rejects(() => getPurchaseOrderById(po.id, ctx), isConflict);
    await assert.rejects(() => submitPurchaseOrder(po.id, ctx), isConflict);
  });

  it("rejects request-line injection into direct OC create and edit without reserving an award", async () => {
    const a = await scope(), b = await scope({ projectId: a.projectId, companyId: otherCompanyId }), c = await scope();
    const ownRequest = await request(a), otherCompanyRequest = await request(b, other), otherProjectRequest = await request(c);
    const po = await createPurchaseOrder(directInput(a), ctx), original = await prisma.purchaseOrderLine.findMany({ where: { purchaseOrderId: po.id } });
    for (const pr of [ownRequest, otherCompanyRequest, otherProjectRequest]) {
      const injected = { ...directInput(a).lines[0]!, purchaseRequestLineId: pr.lines[0]!.id };
      await assert.rejects(() => createPurchaseOrder({ ...directInput(a), lines: [injected] }, ctx), isConflict);
      await assert.rejects(() => updatePurchaseOrder(po.id, { lines: [{ ...injected, id: po.lines[0]!.id }] }, ctx), isConflict);
      assert.equal(await prisma.purchaseOrderLine.count({ where: { purchaseRequestLineId: pr.lines[0]!.id, isActiveAward: true } }), 0);
    }
    assert.deepEqual(await prisma.purchaseOrderLine.findMany({ where: { purchaseOrderId: po.id } }), original);
    assert.equal(await prisma.purchaseOrder.count({ where: { tenantId, projectId: a.projectId } }), 1);
  });

  it("rejects a legacy direct OC carrying a foreign SC-line parent before reads or mutation", async () => {
    const a = await scope(), b = await scope({ projectId: a.projectId, companyId: otherCompanyId }), pr = await request(b, other), po = await order(a, { status: "DRAFT" });
    await prisma.purchaseOrderLine.update({ where: { id: po.lines[0]!.id }, data: { purchaseRequestLineId: pr.lines[0]!.id } });
    await assert.rejects(() => getPurchaseOrderById(po.id, ctx), isConflict);
    await assert.rejects(() => updatePurchaseOrder(po.id, { notes: "Must not persist" }, ctx), isConflict);
    await assert.rejects(() => submitPurchaseOrder(po.id, ctx), isConflict);
    assert.equal((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).notes, null);
  });

  it("keeps legitimate awarded SC and quote parent links when editing and committing the OC", async () => {
    const s = await scope(), pr = await request(s); await submitPurchaseRequest(pr.id, ctx);
    const quote = await createProcurementQuote({ purchaseRequestId: pr.id, supplierContactId: contactId, currency: "ARS", iibbPerceptionRate: "0", validUntil: "2050-01-01", lines: [{ purchaseRequestLineId: pr.lines[0]!.id, unitPrice: "10", taxRate: "0", discountPct: "0", sortOrder: 0, offerKind: "QUOTED" }] }, ctx);
    const awarded = await createPurchaseOrderFromQuoteLines(quote.id, [pr.lines[0]!.id], ctx), po = await getPurchaseOrderById(awarded.purchaseOrderId, ctx);
    const edited = await updatePurchaseOrder(po.id, { lines: [{ ...directInput(s).lines[0]!, id: po.lines[0]!.id, purchaseRequestLineId: pr.lines[0]!.id }] }, ctx);
    assert.equal(edited.lines[0]!.purchaseRequestLineId, pr.lines[0]!.id);
    assert.equal((await submitPurchaseOrder(po.id, ctx)).status, "APPROVED");
    assert.equal((await confirmPurchaseOrder(po.id, ctx)).status, "CONFIRMED");
    const quoteLine = await prisma.procurementQuoteLine.findFirstOrThrow({ where: { procurementQuoteId: quote.id, purchaseRequestLineId: pr.lines[0]!.id } });
    assert.equal((await prisma.purchaseOrderLine.findFirstOrThrow({ where: { purchaseOrderId: po.id } })).procurementQuoteLineId, quoteLine.id);
  });

  it("keeps explicit LAB APU baseline, currency, unit and exact physical quantity", async () => {
    const s = await scope();
    const baseline = await budgetBaselineForPurchaseLine(s.wbsId, { costAnalysisLineId: s.laborId, description: "Synthetic labor", unit: "h" });
    assert.equal(baseline.currency, "ARS"); assert.equal(baseline.unit, "h"); assert.equal(baseline.unitCost?.toFixed(4), "10.0000"); assert.equal(baseline.quantity?.toFixed(4), "20.0000");
    const saved = await createPurchaseOrder(directInput(s, { apu: s.laborId, unit: "h" }), ctx);
    assert.equal(saved.lines[0]!.costType, "LABOR"); assert.equal(saved.lines[0]!.budgetUnitCostSnapshot, "10.0000");
  });

  it("infers APU and WBS nature from the locked graph after an interleaved APU edit, preserving explicit nature", async () => {
    const s = await scope(), input = directInput(s);
    const changeCategory = () => prisma.costAnalysisLine.update({ where: { id: s.materialId }, data: { category: "LABOR" } });
    const created = await interleaveAfterPreview(() => createPurchaseOrder(input, ctx), changeCategory);
    assert.equal(created.lines[0]!.costType, "LABOR");
    const reset = () => prisma.costAnalysisLine.update({ where: { id: s.materialId }, data: { category: "MATERIAL" } });
    await reset();
    const edited = await interleaveAfterPreview(() => updatePurchaseOrder(created.id, { lines: [{ ...input.lines[0]!, id: created.lines[0]!.id }] }, ctx), changeCategory);
    assert.equal(edited.lines[0]!.costType, "LABOR");
    await reset();
    const dominant = await interleaveAfterPreview(() => updatePurchaseOrder(created.id, { lines: [{ ...input.lines[0]!, id: edited.lines[0]!.id, costAnalysisLineId: null }] }, ctx), changeCategory);
    assert.equal(dominant.lines[0]!.costType, "LABOR");
    await reset();
    const explicit = await interleaveAfterPreview(() => updatePurchaseOrder(created.id, { lines: [{ ...input.lines[0]!, id: dominant.lines[0]!.id, costType: "EQUIPMENT" }] }, ctx), changeCategory);
    assert.equal(explicit.lines[0]!.costType, "EQUIPMENT");
  });

  it("captures native USD FX and uses ARS thresholds while keeping same-currency variance native", async () => {
    const s = await scope({ currency: "USD" });
    await prisma.companyProcurementSettings.update({ where: { companyId }, data: { poApprovalThresholdArs: "1000" } });
    try {
      const saved = await createPurchaseOrder(directInput(s, { fxRate: "100.010000" }), ctx);
      assert.equal(saved.totalAmount, "10.00"); assert.equal(saved.fxRate, "100.010000"); assert.equal(saved.totalAmountArs, "1000.10");
      const submitted = await submitPurchaseOrder(saved.id, ctx); assert.equal(submitted.status, "SUBMITTED");
      await assert.rejects(() => approvePurchaseOrder(saved.id, ctx), (error: unknown) => error instanceof ServiceError && error.code === "FORBIDDEN");
      const approved = await approvePurchaseOrder(saved.id, { ...global, companyId }); assert.equal(approved.status, "APPROVED");
      assert.equal(approved.lines[0]!.variancePct, "0.0000");
      const confirmed = await confirmPurchaseOrder(saved.id, ctx); assert.equal(confirmed.status, "CONFIRMED");
    } finally { await prisma.companyProcurementSettings.update({ where: { companyId }, data: { poApprovalThresholdArs: "100000000" } }); }
  });

  it("D-125 keeps a cross-currency purchase but requires its existing no-baseline justification", async () => {
    const s = await scope({ currency: "USD" });
    const saved = await createPurchaseOrder(directInput(s, { currency: "ARS" }), ctx);
    assert.equal(saved.lines[0]!.budgetUnitCostSnapshot, null);
    await assert.rejects(() => submitPurchaseOrder(saved.id, ctx), isConflict);
    await updatePurchaseOrder(saved.id, { lines: [{ ...directInput(s).lines[0]!, id: saved.lines[0]!.id, varianceJustification: "Synthetic supplier price; no comparable currency" }] }, ctx);
    const submitted = await submitPurchaseOrder(saved.id, ctx);
    assert.equal(submitted.status, "APPROVED"); assert.equal(submitted.lines[0]!.varianceTier, "NO_BUDGET_BASELINE"); assert.equal(submitted.lines[0]!.variancePct, null);
    assert.equal(submitted.totalAmountArs, "10.00"); assert.equal(submitted.lines[0]!.budgetCurrency, "USD");
  });

  it("D-125 suppresses a mixed-currency commitment saldo without discarding foreign amounts", async () => {
    const s = await scope(); await order(s);
    const before = (await listProcurementWbsOptions(s.projectId, ctx)).find((row) => row.id === s.wbsId)!;
    assert.equal(before.budgetWarning, null); assert.notEqual(before.availableSaldo, null);
    await order(s, { currency: "USD" });
    const after = (await listProcurementWbsOptions(s.projectId, ctx)).find((row) => row.id === s.wbsId)!;
    assert.equal(after.availableSaldo, null); assert.ok(after.budgetWarning?.includes("moneda"));
  });

  it("rejects a legacy commitment from another project instead of including it in an accessible WBS saldo", async () => {
    const a = await scope(), b = await scope(), foreignProjectPo = await order(b);
    await prisma.purchaseOrderLine.update({ where: { id: foreignProjectPo.lines[0]!.id }, data: { wbsNodeId: a.wbsId, costAnalysisLineId: a.materialId } });
    await assert.rejects(() => listProcurementWbsOptions(a.projectId, ctx), isConflict);
    await assert.rejects(() => getPurchaseOrderById(foreignProjectPo.id, ctx), isConflict);
  });

  it("rechecks the existing justification gate when the budget baseline changes before approval", async () => {
    const s = await scope(), saved = await createPurchaseOrder(directInput(s), ctx);
    await prisma.companyProcurementSettings.update({ where: { companyId }, data: { allowSelfApproval: false } });
    try {
      assert.equal((await submitPurchaseOrder(saved.id, ctx)).status, "SUBMITTED");
      await prisma.budget.update({ where: { id: s.budgetId }, data: { currency: "USD" } });
      await assert.rejects(() => approvePurchaseOrder(saved.id, global), isConflict);
      const unchanged = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: saved.id }, include: { lines: true } });
      assert.equal(unchanged.status, "SUBMITTED");
      assert.equal(unchanged.lines[0]!.varianceTier, "NONE");
    } finally { await prisma.companyProcurementSettings.update({ where: { companyId }, data: { allowSelfApproval: true } }); }
  });

  it("serializes direct OC numbering across two projects in the same company", async () => {
    const a = await scope(), b = await scope();
    const saved = await Promise.all([createPurchaseOrder(directInput(a), ctx), createPurchaseOrder(directInput(b), ctx)]);
    assert.equal(new Set(saved.map((row) => row.number)).size, 2);
  });

  it("blocks product receipt confirmation without a warehouse and keeps all physical effects absent", async () => {
    const s = await scope(), po = await order(s, { product: true }), receipt = await draft(po, ["2"]);
    await assert.rejects(() => confirmPurchaseReceipt(receipt.id, ctx), (error: unknown) => error instanceof ServiceError && error.code === "VALIDATION");
    assert.equal((await prisma.purchaseReceipt.findUniqueOrThrow({ where: { id: receipt.id } })).status, "DRAFT");
    assert.equal((await prisma.purchaseOrderLine.findUniqueOrThrow({ where: { id: po.lines[0]!.id } })).receivedQuantity.toFixed(4), "0.0000");
    assert.equal(await prisma.stockMovement.count({ where: { purchaseReceiptId: receipt.id } }), 0);
  });

  it("rechecks warehouse eligibility when a product receipt is confirmed", async () => {
    const s = await scope(), po = await order(s, { product: true }), receipt = await draft(po, ["2"], warehouseId);
    await prisma.warehouse.update({ where: { id: warehouseId }, data: { status: "INACTIVE" } });
    try { await assert.rejects(() => confirmPurchaseReceipt(receipt.id, ctx), (error: unknown) => error instanceof ServiceError && error.code === "NOT_FOUND"); }
    finally { await prisma.warehouse.update({ where: { id: warehouseId }, data: { status: "ACTIVE" } }); }
    assert.equal(await prisma.stockMovement.count({ where: { purchaseReceiptId: receipt.id } }), 0);
  });

  it("checks the sum of repeated receipt entries against ordered quantity", async () => {
    const s = await scope(), po = await order(s);
    await assert.rejects(() => draft(po, ["6", "6"]), isConflict);
    assert.equal(await prisma.purchaseReceipt.count({ where: { purchaseOrderId: po.id } }), 0);
  });

  it("returns the same receipt for concurrent identical creates with a single idempotency key", async () => {
    const s = await scope(), po = await order(s), input = { purchaseOrderId: po.id, receiptDate: date, idempotencyKey: randomUUID(), lines: [{ purchaseOrderLineId: po.lines[0]!.id, quantityReceived: "10", notes: "Synthetic delivery" }] };
    const receipts = await Promise.all([createPurchaseReceipt(input, ctx), createPurchaseReceipt(input, ctx)]);
    assert.equal(receipts[0]!.id, receipts[1]!.id);
    assert.equal(await prisma.purchaseReceipt.count({ where: { purchaseOrderId: po.id } }), 1);
    await assert.rejects(() => createPurchaseReceipt({ ...input, lines: [{ ...input.lines[0]!, notes: "Changed delivery" }] }, ctx), isConflict);
  });

  it("replays an existing receipt after full confirmation without creating or applying quantities twice", async () => {
    const s = await scope(), po = await order(s), input = { purchaseOrderId: po.id, receiptDate: date, idempotencyKey: randomUUID(), lines: [{ purchaseOrderLineId: po.lines[0]!.id, quantityReceived: "10" }] };
    const receipt = await createPurchaseReceipt(input, ctx); await confirmPurchaseReceipt(receipt.id, ctx);
    const replay = await createPurchaseReceipt(input, ctx);
    assert.equal(replay.id, receipt.id); assert.equal(replay.status, "CONFIRMED");
    assert.equal((await prisma.purchaseOrderLine.findUniqueOrThrow({ where: { id: po.lines[0]!.id } })).receivedQuantity.toFixed(4), "10.0000");
    assert.equal(await prisma.purchaseReceipt.count({ where: { purchaseOrderId: po.id } }), 1);
  });

  it("D-127 serializes new receipt numbers across projects in the same company", async () => {
    const a = await scope(), b = await scope(), first = await order(a), second = await order(b);
    const before = await prisma.purchaseReceipt.aggregate({ where: { tenantId, companyId }, _max: { number: true } });
    const receipts = await Promise.all([draft(first, ["1"]), draft(second, ["1"])]);
    assert.deepEqual(receipts.map((receipt) => receipt.number).sort((left, right) => left! - right!), [(before._max.number ?? 0) + 1, (before._max.number ?? 0) + 2]);
    for (const receipt of receipts) assert.equal(receipt.code, `RC-${String(receipt.number).padStart(3, "0")}`);
  });

  it("D-127 has an independent sequence for each company on a shared project", async () => {
    const a = await scope(), b = await scope({ projectId: a.projectId, companyId: otherCompanyId }), po = await order(b);
    const receipt = await createPurchaseReceipt({ purchaseOrderId: po.id, receiptDate: date, idempotencyKey: randomUUID(), lines: [{ purchaseOrderLineId: po.lines[0]!.id, quantityReceived: "1" }] }, global);
    assert.equal(receipt.companyId, otherCompanyId); assert.equal(receipt.number, 1); assert.equal(receipt.code, "RC-001");
    await assert.rejects(() => getPurchaseReceiptById(receipt.id, ctx), denied);
  });

  it("D-127 preserves replay numbers and does not reuse cancelled receipt numbers", async () => {
    const s = await scope(), po = await order(s), cancelled = await draft(po, ["1"]); await cancelPurchaseReceipt(cancelled.id, ctx);
    const input = { purchaseOrderId: po.id, receiptDate: date, idempotencyKey: randomUUID(), lines: [{ purchaseOrderLineId: po.lines[0]!.id, quantityReceived: "1" }] };
    const created = await createPurchaseReceipt(input, ctx), replay = await createPurchaseReceipt(input, ctx);
    assert.equal(created.number, cancelled.number! + 1); assert.equal(replay.number, created.number); assert.equal(replay.id, created.id);
    assert.equal((await prisma.purchaseReceipt.findUniqueOrThrow({ where: { id: cancelled.id } })).number, cancelled.number);
  });

  it("D-127 keeps historical UUID identification without numbering on read, edit or confirmation", async () => {
    const s = await scope(), po = await order(s);
    const historical = await prisma.purchaseReceipt.create({ data: { tenantId, companyId, projectId: s.projectId, purchaseOrderId: po.id, supplierContactId: contactId, receiptDate: day, lines: { create: { purchaseOrderLineId: po.lines[0]!.id, quantityReceived: 1 } } } });
    const view = await getPurchaseReceiptById(historical.id, ctx);
    assert.equal(view.number, null); assert.equal(view.code, `Recepción histórica ${historical.id}`);
    const edited = await updatePurchaseReceipt(historical.id, { receiptDate: date, notes: "Synthetic historical note", lines: [{ purchaseOrderLineId: po.lines[0]!.id, quantityReceived: "2" }] }, ctx);
    assert.equal(edited.number, null); assert.equal((await confirmPurchaseReceipt(historical.id, ctx)).number, null);
  });

  it("honors configured over-receipt tolerance on the aggregate, without duplicate confirm effects", async () => {
    const s = await scope(), po = await order(s);
    await prisma.companyProcurementSettings.update({ where: { companyId }, data: { overReceiptTolerancePct: "5" } });
    try {
      const receipt = await draft(po, ["5", "5.5"]); const results = await Promise.allSettled([confirmPurchaseReceipt(receipt.id, ctx), confirmPurchaseReceipt(receipt.id, ctx)]);
      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
      assert.equal((await prisma.purchaseOrderLine.findUniqueOrThrow({ where: { id: po.lines[0]!.id } })).receivedQuantity.toFixed(4), "10.5000");
    } finally { await prisma.companyProcurementSettings.update({ where: { companyId }, data: { overReceiptTolerancePct: "0" } }); }
  });

  it("rejects reversal of two four-unit stock entries when only five remain and rolls back everything", async () => {
    const s = await scope(), po = await order(s, { product: true }), receipt = await draft(po, ["4", "4"], warehouseId); await confirmPurchaseReceipt(receipt.id, ctx);
    await prisma.stockMovement.create({ data: { tenantId, companyId, projectId: s.projectId, wbsNodeId: s.wbsId, warehouseId, productId, quantity: 3, type: "OUT", sourceType: "CONSUMPTION", movementDate: day, status: "CONFIRMED" } });
    // Each test uses a project but the physical balance is warehouse/product-wide.
    const balance = await getStockBalance({ tenantId, warehouseId, productId });
    assert.equal(balance.toFixed(4), "5.0000");
    await assert.rejects(() => cancelPurchaseReceipt(receipt.id, ctx), isConflict);
    assert.equal((await prisma.purchaseReceipt.findUniqueOrThrow({ where: { id: receipt.id } })).status, "CONFIRMED");
    assert.equal((await prisma.purchaseOrderLine.findUniqueOrThrow({ where: { id: po.lines[0]!.id } })).receivedQuantity.toFixed(4), "8.0000");
    assert.equal(await prisma.stockMovement.count({ where: { purchaseReceiptId: receipt.id, status: "CONFIRMED", type: "IN" } }), 2);
  });

  it("reverses grouped receipt stock when the complete balance is still available", async () => {
    // A separate product avoids relying on stock left by the consumed-receipt scenario.
    const scopedProduct = await prisma.product.create({ data: { tenantId, companyId, sku: randomUUID(), name: "Synthetic independent reversal material", unit: "un" } });
    const s = await scope(), po = await order(s, { product: true }); await prisma.purchaseOrderLine.update({ where: { id: po.lines[0]!.id }, data: { productId: scopedProduct.id } });
    const receipt = await draft(po, ["4", "4"], warehouseId); await confirmPurchaseReceipt(receipt.id, ctx); await cancelPurchaseReceipt(receipt.id, ctx);
    assert.equal((await getStockBalance({ tenantId, warehouseId, productId: scopedProduct.id })).toFixed(4), "0.0000");
    assert.equal((await prisma.purchaseOrderLine.findUniqueOrThrow({ where: { id: po.lines[0]!.id } })).receivedQuantity.toFixed(4), "0.0000");
    assert.equal((await prisma.purchaseReceipt.findUniqueOrThrow({ where: { id: receipt.id } })).status, "CANCELLED");
  });

  it("refuses receipt lines belonging to a different OC before exposing or confirming them", async () => {
    const a = await scope(), b = await scope(), po = await order(a), foreignPo = await order(b), receipt = await draft(po, ["2"]);
    await prisma.purchaseReceiptLine.update({ where: { id: receipt.lines[0]!.id }, data: { purchaseOrderLineId: foreignPo.lines[0]!.id } });
    await assert.rejects(() => getPurchaseReceiptById(receipt.id, ctx), isConflict);
    await assert.rejects(() => confirmPurchaseReceipt(receipt.id, ctx), isConflict);
    assert.equal((await prisma.purchaseOrderLine.findUniqueOrThrow({ where: { id: foreignPo.lines[0]!.id } })).receivedQuantity.toFixed(4), "0.0000");
  });

  it("serializes draft receipt creation with OC cancellation and leaves no active orphan", async () => {
    const s = await scope(), po = await order(s);
    const results = await Promise.allSettled([draft(po, ["2"]), cancelPurchaseOrder(po.id, ctx)]);
    assert.ok(results.some((result) => result.status === "fulfilled"));
    assert.equal((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).status, "CANCELLED");
    assert.equal(await prisma.purchaseReceipt.count({ where: { purchaseOrderId: po.id, status: { not: "CANCELLED" } } }), 0);
  });

  it("serializes receipt edits with confirmation and uses the actual persisted quantities", async () => {
    const s = await scope(), po = await order(s), receipt = await draft(po, ["2"]);
    await Promise.allSettled([updatePurchaseReceipt(receipt.id, { receiptDate: date, lines: [{ purchaseOrderLineId: po.lines[0]!.id, quantityReceived: "3" }] }, ctx), confirmPurchaseReceipt(receipt.id, ctx)]);
    let current = await getPurchaseReceiptById(receipt.id, ctx);
    if (current.status === "DRAFT") current = await confirmPurchaseReceipt(receipt.id, ctx);
    assert.equal((await prisma.purchaseOrderLine.findUniqueOrThrow({ where: { id: po.lines[0]!.id } })).receivedQuantity.toFixed(4), current.lines[0]!.quantityReceived);
  });

  it("requires project access and active status for cancellation and return", async () => {
    const s = await scope(), submitted = await order(s, { status: "SUBMITTED" });
    await assert.rejects(() => cancelPurchaseOrder(submitted.id, pm), denied);
    await assert.rejects(() => returnPurchaseOrder(submitted.id, "Synthetic correction", pm), denied);
    await prisma.project.update({ where: { id: s.projectId }, data: { status: "ON_HOLD" } });
    await assert.rejects(() => cancelPurchaseOrder(submitted.id, ctx), isConflict);
    await assert.rejects(() => returnPurchaseOrder(submitted.id, "Synthetic correction", ctx), isConflict);
  });

  it("rejects a valid APU ID whose declared budget contradicts its own CostItem and WBS", async () => {
    const a = await scope(), b = await scope({ projectId: a.projectId });
    await prisma.costAnalysisLine.update({ where: { id: a.materialId }, data: { budgetId: b.budgetId } });
    await assert.rejects(() => createPurchaseOrder(directInput(a), ctx), isConflict);
    await assert.rejects(() => budgetBaselineForPurchaseLine(a.wbsId, { costAnalysisLineId: a.materialId, description: "Synthetic material", unit: "un" }), isConflict);
  });

  it("does not reverse foreign-tenant stock rows linked to an own receipt", async () => {
    const s = await scope(), po = await order(s, { product: true }), receipt = await draft(po, ["2"], warehouseId); await confirmPurchaseReceipt(receipt.id, ctx);
    const movement = await prisma.stockMovement.create({ data: { tenantId: foreignTenantId, companyId: foreignCompanyId, warehouseId: foreignWarehouseId, productId: foreignProductId, purchaseReceiptId: receipt.id, type: "IN", sourceType: "PURCHASE_RECEIPT", quantity: 2, movementDate: day, status: "CONFIRMED" } });
    await assert.rejects(() => cancelPurchaseReceipt(receipt.id, ctx), isConflict);
    assert.equal((await prisma.stockMovement.findUniqueOrThrow({ where: { id: movement.id } })).status, "CONFIRMED");
    assert.equal((await prisma.purchaseReceipt.findUniqueOrThrow({ where: { id: receipt.id } })).status, "CONFIRMED");
  });

  it("leaves consumption traces intact when cancelling only the originating receipt IN movements", async () => {
    const isolated = await prisma.product.create({ data: { tenantId, companyId, sku: randomUUID(), name: "Synthetic traced stock", unit: "un" } });
    const s = await scope(), po = await order(s, { product: true }); await prisma.purchaseOrderLine.update({ where: { id: po.lines[0]!.id }, data: { productId: isolated.id } });
    const receipt = await draft(po, ["4", "4"], warehouseId); await confirmPurchaseReceipt(receipt.id, ctx);
    await prisma.stockMovement.create({ data: { tenantId, companyId, warehouseId, productId: isolated.id, type: "IN", sourceType: "OPENING_BALANCE", quantity: 5, movementDate: day, status: "CONFIRMED" } });
    const trace = await prisma.stockMovement.create({ data: { tenantId, companyId, warehouseId, productId: isolated.id, projectId: s.projectId, wbsNodeId: s.wbsId, purchaseReceiptId: receipt.id, type: "OUT", sourceType: "CONSUMPTION", quantity: 1, movementDate: day, status: "CONFIRMED" } });
    await cancelPurchaseReceipt(receipt.id, ctx);
    assert.equal((await prisma.stockMovement.findUniqueOrThrow({ where: { id: trace.id } })).status, "CONFIRMED");
    assert.equal((await getStockBalance({ tenantId, warehouseId, productId: isolated.id })).toFixed(4), "4.0000");
  });

  it("preserves exact historical PO line amounts on unchanged net-price edits", async () => {
    const s = await scope(), po = await order(s, { status: "DRAFT" });
    await prisma.purchaseOrderLine.update({ where: { id: po.lines[0]!.id }, data: { quantity: 333, unitPrice: "8.2645", taxRate: 21, lineSubtotal: "2752.07", lineTax: "577.93", lineTotal: "3330" } });
    await prisma.purchaseOrder.update({ where: { id: po.id }, data: { subtotal: "2752.07", taxAmount: "577.93", totalAmount: "3330", totalAmountArs: "3330" } });
    const saved = await updatePurchaseOrder(po.id, { lines: [{ ...directInput(s).lines[0]!, id: po.lines[0]!.id, description: "Synthetic description-only edit", quantity: "333", unitPrice: "8.2645", taxRate: "21" }] }, ctx);
    assert.equal(saved.totalAmount, "3330.00"); assert.equal(saved.totalAmountArs, "3330.00"); assert.equal(saved.lines[0]!.lineTax, "577.93");
  });

  it("blocks OC cancellation protected by an active fiscal line even without its legacy header link", async () => {
    const s = await scope(), po = await order(s);
    await prisma.supplierInvoice.create({ data: { tenantId, companyId, projectId: s.projectId, supplierContactId: contactId, number: 1, issueDate: day, dueDate: day, currency: "ARS", subtotal: 10, totalAmount: 10, amountArs: 10, status: "DRAFT", lines: { create: { purchaseOrderLineId: po.lines[0]!.id, wbsNodeId: s.wbsId, costAnalysisLineId: s.materialId, description: "Synthetic legacy fiscal reference", quantity: 1, unitPrice: 10, lineSubtotal: 10, lineTotal: 10 } } } });
    await assert.rejects(() => cancelPurchaseOrder(po.id, ctx), isConflict);
    assert.equal((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } })).status, "CONFIRMED");
  });

  async function unitProduct(unit = "kg") {
    return prisma.product.create({ data: { tenantId, companyId: null, sku: randomUUID(), name: "Synthetic D130 product", unit } });
  }

  it("D130 accepts matching product units on new OC lines and rejects incompatible create or edit atomically", async () => {
    const s = await scope(), product = await unitProduct();
    const input = directInput(s, { product: product.id, unit: " KG " });
    const po = await createPurchaseOrder(input, ctx);
    assert.equal(po.lines[0]!.unit, " KG ");
    const before = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id }, include: { lines: true } });
    const auditCount = await prisma.auditLog.count({ where: { tenantId, entityId: po.id } });
    await assert.rejects(() => createPurchaseOrder(directInput(s, { product: product.id, unit: "t" }), ctx), isConflict);
    await assert.rejects(() => createPurchaseOrder(directInput(s, { product: product.id, unit: "" }), ctx), isConflict);
    await assert.rejects(() => updatePurchaseOrder(po.id, { lines: [{ ...input.lines[0]!, id: po.lines[0]!.id, unit: "t" }] }, ctx), isConflict);
    assert.deepEqual(await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id }, include: { lines: true } }), before);
    assert.equal(await prisma.auditLog.count({ where: { tenantId, entityId: po.id } }), auditCount);
    assert.equal(await prisma.purchaseOrder.count({ where: { tenantId, projectId: s.projectId } }), 1);
  });

  it("D130 blocks a legacy incompatible receipt before status quantity schedule or stock effects", async () => {
    const s = await scope(), product = await unitProduct(), po = await order(s, { productId: product.id });
    await prisma.purchaseOrderLine.update({ where: { id: po.lines[0]!.id }, data: { unit: "bolsa" } });
    const receipt = await draft(po, ["2"], warehouseId);
    const before = await prisma.purchaseOrderLine.findUniqueOrThrow({ where: { id: po.lines[0]!.id } });
    const auditCount = await prisma.auditLog.count({ where: { tenantId, entityId: receipt.id } });
    assert.equal((await getPurchaseOrderById(po.id, ctx)).lines[0]!.unit, "bolsa");
    await assert.rejects(() => confirmPurchaseReceipt(receipt.id, ctx), isConflict);
    assert.equal((await prisma.purchaseReceipt.findUniqueOrThrow({ where: { id: receipt.id } })).status, "DRAFT");
    assert.deepEqual(await prisma.purchaseOrderLine.findUniqueOrThrow({ where: { id: before.id } }), before);
    assert.equal(await prisma.stockMovement.count({ where: { purchaseReceiptId: receipt.id } }), 0);
    assert.equal(await prisma.auditLog.count({ where: { tenantId, entityId: receipt.id } }), auditCount);
    await cancelPurchaseReceipt(receipt.id, ctx);
  });

  it("D130 receives compatible quantities exactly and preserves an existing idempotent result after a legacy unit discrepancy", async () => {
    const s = await scope(), product = await unitProduct(), po = await order(s, { productId: product.id });
    await prisma.purchaseOrderLine.update({ where: { id: po.lines[0]!.id }, data: { unit: " KG " } });
    const input = { purchaseOrderId: po.id, warehouseId, receiptDate: date, idempotencyKey: randomUUID(), lines: [{ purchaseOrderLineId: po.lines[0]!.id, quantityReceived: "1.2345" }] };
    const receipt = await createPurchaseReceipt(input, ctx);
    await confirmPurchaseReceipt(receipt.id, ctx);
    const movements = await prisma.stockMovement.findMany({ where: { purchaseReceiptId: receipt.id } });
    assert.equal(movements.length, 1);
    assert.equal(movements[0]!.quantity.toFixed(4), "1.2345");
    await prisma.product.update({ where: { id: product.id }, data: { unit: "t" } });
    try {
      const replay = await createPurchaseReceipt(input, ctx);
      assert.equal(replay.id, receipt.id);
      assert.equal(await prisma.stockMovement.count({ where: { purchaseReceiptId: receipt.id } }), 1);
    } finally { await prisma.product.update({ where: { id: product.id }, data: { unit: "kg" } }); }
  });

  it("D130 validates new awarded OC units and rolls a multi-group award back without partial documents", async () => {
    const s = await scope(), product = await unitProduct();
    const pr = await createPurchaseRequest({ projectId: s.projectId, neededByDate: date, lines: [0, 1].map((sortOrder) => ({ wbsNodeId: s.wbsId, productId: product.id, description: `Synthetic D130 requested ${sortOrder}`, unit: "kg", quantity: "1", lineType: "MATERIAL" as const, sortOrder })) }, ctx);
    await submitPurchaseRequest(pr.id, ctx);
    const quote = await createProcurementQuote({ purchaseRequestId: pr.id, supplierContactId: contactId, currency: "ARS", iibbPerceptionRate: "0", validUntil: "2050-01-01", lines: pr.lines.map((line, sortOrder) => ({ purchaseRequestLineId: line.id, unitPrice: "10", taxRate: "0", discountPct: "0", offerKind: "QUOTED" as const, sortOrder })) }, ctx);
    await prisma.purchaseRequestLine.update({ where: { id: pr.lines[1]!.id }, data: { unit: "bolsa" } });
    await assert.rejects(() => createPurchaseOrderFromQuoteLines(quote.id, [pr.lines[1]!.id], ctx), isConflict);
    await assert.rejects(() => createPurchaseOrdersFromAwards(pr.id, pr.lines.map((line) => ({ procurementQuoteId: quote.id, purchaseRequestLineIds: [line.id] })), ctx), isConflict);
    assert.equal(await prisma.purchaseOrder.count({ where: { purchaseRequestId: pr.id } }), 0);
    assert.ok((await prisma.purchaseRequestLine.findMany({ where: { purchaseRequestId: pr.id } })).every((line) => line.awardedPurchaseOrderId === null));
    await prisma.purchaseRequestLine.update({ where: { id: pr.lines[1]!.id }, data: { unit: "kg" } });
    const awarded = await createPurchaseOrderFromQuoteLines(quote.id, pr.lines.map((line) => line.id), ctx);
    const po = await getPurchaseOrderById(awarded.purchaseOrderId, ctx);
    assert.ok(po.lines.every((line) => line.unit === "kg" && line.productId === product.id));
  });

  it("D130 first OC reference wins against a previewed product unit edit and freezes the original unit", async () => {
    const s = await scope(), product = await unitProduct();
    await assert.rejects(() => interleaveAfterPreview(
      () => updateProduct(product.id, { unit: "t" }, ctx),
      () => createPurchaseOrder(directInput(s, { product: product.id, unit: "kg" }), ctx),
    ), isConflict);
    assert.equal((await getProductById(product.id, ctx)).unit, "kg");
    assert.equal(await prisma.purchaseOrderLine.count({ where: { productId: product.id, unit: "kg" } }), 1);
  });

  it("D130 product unit edit wins before a new OC reference and rejects its stale explicit unit", async () => {
    const s = await scope(), product = await unitProduct();
    await assert.rejects(() => interleaveAfterPreview(
      () => createPurchaseOrder(directInput(s, { product: product.id, unit: "kg" }), ctx),
      () => updateProduct(product.id, { unit: "t" }, ctx),
    ), isConflict);
    assert.equal((await getProductById(product.id, ctx)).unit, "t");
    assert.equal(await prisma.purchaseOrderLine.count({ where: { productId: product.id } }), 0);
  });

  it("D130 preserves historical OC reads header-only edits and cancellation without reinterpreting a unit", async () => {
    const s = await scope(), product = await unitProduct(), po = await order(s, { status: "DRAFT", productId: product.id });
    await prisma.purchaseOrderLine.update({ where: { id: po.lines[0]!.id }, data: { unit: "bolsa" } });
    assert.equal((await getPurchaseOrderById(po.id, ctx)).lines[0]!.unit, "bolsa");
    await updatePurchaseOrder(po.id, { notes: "Synthetic header correction only" }, ctx);
    await cancelPurchaseOrder(po.id, ctx);
    assert.equal((await prisma.purchaseOrderLine.findUniqueOrThrow({ where: { id: po.lines[0]!.id } })).unit, "bolsa");
    await assert.rejects(() => updateProduct(product.id, { unit: "t" }, ctx), isConflict);
  });

  it("D130 rechecks the product unit after receipt preflight before creating any physical effect", async () => {
    const s = await scope(), product = await unitProduct(), po = await order(s, { productId: product.id });
    await prisma.purchaseOrderLine.update({ where: { id: po.lines[0]!.id }, data: { unit: "kg" } });
    const receipt = await draft(po, ["2"], warehouseId);
    await assert.rejects(() => interleaveAfterPreview(
      () => confirmPurchaseReceipt(receipt.id, ctx),
      () => prisma.product.update({ where: { id: product.id }, data: { unit: "t" } }),
    ), isConflict);
    assert.equal((await prisma.purchaseReceipt.findUniqueOrThrow({ where: { id: receipt.id } })).status, "DRAFT");
    assert.equal((await prisma.purchaseOrderLine.findUniqueOrThrow({ where: { id: po.lines[0]!.id } })).receivedQuantity.toString(), "0");
    assert.equal(await prisma.stockMovement.count({ where: { purchaseReceiptId: receipt.id } }), 0);
    await prisma.product.update({ where: { id: product.id }, data: { unit: "kg" } });
  });

  async function withFxReviewPolicy(action: () => Promise<void>) {
    const saved = await prisma.companyProcurementSettings.findUniqueOrThrow({ where: { companyId } });
    await prisma.companyProcurementSettings.update({ where: { companyId }, data: { poApprovalThresholdArs: "1500", allowSelfApproval: true } });
    try { await action(); }
    finally { await prisma.companyProcurementSettings.update({ where: { companyId }, data: { poApprovalThresholdArs: saved.poApprovalThresholdArs, allowSelfApproval: saved.allowSelfApproval } }); }
  }

  async function approvedForFx(s: Scope, justification?: string) {
    const po = await order(s, { status: "APPROVED", quantity: "1" });
    await prisma.purchaseOrder.update({ where: { id: po.id }, data: { approvedByUserId: actorId, approvedAt: day } });
    if (justification) await prisma.purchaseOrderLine.update({ where: { id: po.lines[0]!.id }, data: { varianceJustification: justification } });
    await prisma.projectMembership.createMany({ data: [secondActorId, pmId].map((userId) => ({ tenantId, projectId: s.projectId, userId, createdBy: actorId })), skipDuplicates: true });
    return po;
  }

  async function approvalState(id: string) {
    return {
      order: await prisma.purchaseOrder.findUniqueOrThrow({ where: { id } }),
      lines: await prisma.purchaseOrderLine.findMany({ where: { purchaseOrderId: id }, orderBy: { id: "asc" } }),
      audits: await prisma.auditLog.findMany({ where: { tenantId, entityId: id }, orderBy: { id: "asc" } }),
    };
  }

  /** All document/audit writes still use the real SQL transaction; fail only its final audit boundary. */
  async function assertRollbackOnConfirmationAuditFailure(action: () => Promise<unknown>) {
    const original = prisma.$transaction, transact = original.bind(prisma);
    let approvalAuditWritten = false;
    prisma.$transaction = (async (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options: object) => transact(async (tx) => {
      const audit = tx.auditLog, createAudit = audit.create.bind(audit);
      const guardedAudit = new Proxy(audit, { get(target, key, receiver) {
        if (key === "create") return async (args: Prisma.AuditLogCreateArgs) => {
          if (args.data.action === "purchase_order.confirmed") throw new Error("Synthetic D129 confirmation audit failure");
          const result = await createAudit(args);
          if (args.data.action === "purchase_order.approved") approvalAuditWritten = true;
          return result;
        };
        const value = Reflect.get(target, key, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      } });
      const guardedTx = new Proxy(tx, { get(target, key, receiver) {
        if (key === "auditLog") return guardedAudit;
        const value = Reflect.get(target, key, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      } });
      return work(guardedTx);
    }, options)) as typeof prisma.$transaction;
    try { await assert.rejects(action, /Synthetic D129 confirmation audit failure/); }
    finally { prisma.$transaction = original; }
    assert.equal(approvalAuditWritten, true, "The approval audit was actually inserted before the failing confirmation audit");
  }

  it("D129 blocks a changed FX crossing the approval threshold for a standard buyer without mutating the approved OC", async () => withFxReviewPolicy(async () => {
    const s = await scope({ currency: "USD" }), po = await approvedForFx(s), before = await approvalState(po.id);
    const buyer: ServiceContext = { ...ctx, actorUserId: secondActorId, roles: ["PROCUREMENT"] };
    await assert.rejects(() => confirmPurchaseOrder(po.id, buyer, { fxRate: "200" }), (error: unknown) => error instanceof ServiceError && error.code === "FORBIDDEN" && error.message.includes("aprobador habilitado"));
    assert.deepEqual(await approvalState(po.id), before);
  }));

  it("D129 requires approval permission for any changed FX even when the new amount is below the high-level threshold", async () => withFxReviewPolicy(async () => {
    const s = await scope({ currency: "USD" }), po = await approvedForFx(s), before = await approvalState(po.id);
    await assert.rejects(() => confirmPurchaseOrder(po.id, pm, { fxRate: "101" }), (error: unknown) => error instanceof ServiceError && error.code === "FORBIDDEN" && error.message.includes("aprobador habilitado"));
    assert.deepEqual(await approvalState(po.id), before);
  }));

  it("D129 reapplies requester segregation for high-level FX changes and for the current no-self-approval policy", async () => withFxReviewPolicy(async () => {
    const s = await scope({ currency: "USD" }), po = await approvedForFx(s), before = await approvalState(po.id);
    await assert.rejects(() => confirmPurchaseOrder(po.id, ctx, { fxRate: "200" }), (error: unknown) => error instanceof ServiceError && error.code === "FORBIDDEN" && error.message.includes("originaste"));
    assert.deepEqual(await approvalState(po.id), before);
    await prisma.companyProcurementSettings.update({ where: { companyId }, data: { allowSelfApproval: false } });
    await assert.rejects(() => confirmPurchaseOrder(po.id, ctx, { fxRate: "101" }), (error: unknown) => error instanceof ServiceError && error.code === "FORBIDDEN" && error.message.includes("originaste"));
    assert.deepEqual(await approvalState(po.id), before);
  }));

  it("D129 renews approval and audits old/new FX before confirming with an authorized other owner", async () => withFxReviewPolicy(async () => {
    const s = await scope({ currency: "USD" }), po = await approvedForFx(s);
    const confirmed = await confirmPurchaseOrder(po.id, global, { fxRate: "200.000000" });
    assert.equal(confirmed.status, "CONFIRMED"); assert.equal(confirmed.fxRate, "200.000000"); assert.equal(confirmed.totalAmount, "10.00"); assert.equal(confirmed.totalAmountArs, "2000.00");
    assert.equal(confirmed.approvedByUserId, secondActorId); assert.equal(confirmed.confirmedByUserId, secondActorId); assert.ok(confirmed.approvedAt && confirmed.approvedAt.getTime() > day.getTime());
    const audits = await prisma.auditLog.findMany({ where: { tenantId, entityId: po.id } });
    assert.deepEqual(audits.map((audit) => audit.action).sort(), ["purchase_order.approved", "purchase_order.confirmed"]);
    const approved = audits.find((audit) => audit.action === "purchase_order.approved")!;
    assert.equal((approved.before as Record<string, unknown>).fxRate, "100.000000"); assert.equal((approved.after as Record<string, unknown>).fxRate, "200.000000");
    assert.equal((approved.before as Record<string, unknown>).totalAmountArs, "1000.00"); assert.equal((approved.after as Record<string, unknown>).totalAmountArs, "2000.00");
    const immutable = await approvalState(po.id);
    await assert.rejects(() => confirmPurchaseOrder(po.id, global, { fxRate: "300" }), isConflict);
    await assert.rejects(() => updatePurchaseOrder(po.id, { fxRate: "300" }, global), isConflict);
    assert.deepEqual(await approvalState(po.id), immutable);
  }));

  it("D129 rechecks missing variance justifications and rolls back their tentative snapshots", async () => withFxReviewPolicy(async () => {
    const s = await scope({ currency: "USD" }), po = await approvedForFx(s);
    await prisma.budget.update({ where: { id: s.budgetId }, data: { currency: "ARS" } });
    const before = await approvalState(po.id);
    await assert.rejects(() => confirmPurchaseOrder(po.id, global, { fxRate: "101" }), (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT" && error.message.includes("justificación"));
    assert.deepEqual(await approvalState(po.id), before);
  }));

  it("D129 applies the current EXTRA_APPROVAL variance level independently of the amount threshold", async () => withFxReviewPolicy(async () => {
    const s = await scope({ currency: "USD" }), po = await approvedForFx(s, "Synthetic supplier price difference already justified");
    await prisma.costAnalysisLine.update({ where: { id: s.materialId }, data: { unitCost: 5, totalCost: 5 } });
    const before = await approvalState(po.id), buyer: ServiceContext = { ...ctx, actorUserId: secondActorId, roles: ["PROCUREMENT"] };
    await assert.rejects(() => confirmPurchaseOrder(po.id, buyer, { fxRate: "101" }), denied);
    assert.deepEqual(await approvalState(po.id), before);
    const confirmed = await confirmPurchaseOrder(po.id, global, { fxRate: "101" });
    assert.equal(confirmed.status, "CONFIRMED"); assert.equal(confirmed.totalAmountArs, "1010.00"); assert.equal(confirmed.lines[0]!.varianceTier, "EXTRA_APPROVAL"); assert.equal(confirmed.lines[0]!.variancePct, "100.0000");
  }));

  it("D129 keeps EDIT-only confirmation and the previous approval when the numeric FX is unchanged", async () => withFxReviewPolicy(async () => {
    const s = await scope({ currency: "USD" }), po = await approvedForFx(s), original = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } });
    const confirmed = await confirmPurchaseOrder(po.id, pm, { fxRate: "100.000000" });
    assert.equal(confirmed.status, "CONFIRMED"); assert.equal(confirmed.fxRate, "100.000000"); assert.equal(confirmed.approvedByUserId, original.approvedByUserId); assert.deepEqual(confirmed.approvedAt, original.approvedAt);
    const audits = await prisma.auditLog.findMany({ where: { tenantId, entityId: po.id } });
    assert.deepEqual(audits.map((audit) => audit.action), ["purchase_order.confirmed"]);
  }));

  it("D129 rolls back approval, FX, variance and its approval audit if the confirmation audit fails", async () => withFxReviewPolicy(async () => {
    const s = await scope({ currency: "USD" }), po = await approvedForFx(s), before = await approvalState(po.id);
    await assertRollbackOnConfirmationAuditFailure(() => confirmPurchaseOrder(po.id, global, { fxRate: "200" }));
    assert.deepEqual(await approvalState(po.id), before);
  }));
});
