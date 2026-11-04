/** Maintained AG-06 integrations for policy, hub, notification audience and the AP boundary. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { Prisma, prisma } from "@bloqer/database";

import {
  createSupplierInvoiceDraftFromPurchaseOrder, getPurchaseOrderBillingSummary,
  getPurchaseOrderInvoiceDraftPreview,
  getSupplierInvoicePurchaseOrderWarnings, listSupplierInvoicesByPurchaseOrder,
} from "../ap/supplier-invoice-from-po.service";
import { clearProjectAccessModeCache } from "../security/access";
import { assertAuditDatabaseIdentity } from "../testing/audit-fixture";
import { ServiceError, type ServiceContext } from "../types";
import { createSupplierInvoice, updateSupplierInvoice, issueSupplierInvoice } from "../ap/supplier-invoice.service";
import {
  getCompanyProcurementSettings, getCompanyProcurementSettingsForProject, upsertCompanyProcurementSettings,
} from "./company-procurement-settings.service";
import { canViewProcurementProjectArea, canViewPurchaseRequests } from "./procurement-access";
import { filterProcurementNotificationRecipients } from "./procurement-notification-audience";
import { notifyPurchaseRequestSubmitted, runProcurementSlaReminders } from "./procurement-notifications.service";
import { getProjectProcurementHub } from "./project-procurement-hub.service";

const live = process.env.BLOQER_AUDIT_LIVE === "1";
const isError = (code: string) => (error: unknown) => error instanceof ServiceError && error.code === code;

describe("AG-06 procurement platform connections on isolated SQL", { skip: !live, concurrency: false }, () => {
  const tenantId = randomUUID(), foreignTenantId = randomUUID();
  const companyId = randomUUID(), otherCompanyId = randomUUID(), foreignCompanyId = randomUUID();
  const ownerId = randomUUID(), otherOwnerId = randomUUID(), procurementId = randomUUID();
  const globalOwnerId = randomUUID(), foremanId = randomUUID(), inactiveUserId = randomUUID();
  const contactId = randomUUID();
  const userIds = [ownerId, otherOwnerId, procurementId, globalOwnerId, foremanId, inactiveUserId];
  const ctx: ServiceContext = { tenantId, companyId, actorUserId: ownerId, roles: ["OWNER"] };
  const foreman: ServiceContext = { tenantId, companyId, actorUserId: foremanId, roles: ["SITE_FOREMAN"] };
  const today = new Date("2026-11-04T00:00:00.000Z");
  let verified = false, number = 0;

  before(async () => {
    await assertAuditDatabaseIdentity(prisma);
    verified = true;
    clearProjectAccessModeCache();
    await prisma.$transaction(async (tx) => {
      await tx.tenant.createMany({ data: [tenantId, foreignTenantId].map((id) => ({
        id, name: "Synthetic AG06 platform", slug: `audit-ag06-platform-${id}`, projectAccessMode: "MEMBERSHIP_SCOPED" as const,
      })) });
      await tx.company.createMany({ data: [
        { id: companyId, tenantId, name: "Synthetic AG06 company A" },
        { id: otherCompanyId, tenantId, name: "Synthetic AG06 company B" },
        { id: foreignCompanyId, tenantId: foreignTenantId, name: "Synthetic AG06 foreign company" },
      ] });
      await tx.user.createMany({ data: userIds.map((id) => ({ id, email: `audit-ag06-${id}@example.test`, status: id === inactiveUserId ? "INACTIVE" as const : "ACTIVE" as const })) });
      await tx.userMembership.createMany({ data: [
        { tenantId, companyId, userId: ownerId, roles: ["OWNER"] },
        { tenantId, companyId: otherCompanyId, userId: otherOwnerId, roles: ["OWNER"] },
        { tenantId, companyId, userId: procurementId, roles: ["PROCUREMENT"] },
        { tenantId, companyId: null, userId: globalOwnerId, roles: ["OWNER"] },
        { tenantId, companyId, userId: foremanId, roles: ["SITE_FOREMAN"] },
        { tenantId, companyId, userId: inactiveUserId, roles: ["PROCUREMENT"] },
      ] });
      await tx.contact.create({ data: { id: contactId, tenantId, legalName: "Synthetic AG06 supplier" } });
      await tx.contactRole.createMany({ data: ["SUPPLIER", "CLIENT"].map((role) => ({ tenantId, contactId, role: role as "SUPPLIER" | "CLIENT" })) });
    }, { timeout: 30_000 });
  });

  after(async () => {
    clearProjectAccessModeCache();
    if (!verified) return;
    try {
      await prisma.$transaction(async (tx) => {
        const tenants = { in: [tenantId, foreignTenantId] };
        await tx.emailDeliveryLog.deleteMany({ where: { tenantId: tenants } });
        await tx.notification.deleteMany({ where: { tenantId: tenants } });
        await tx.userNotificationEmailPreference.deleteMany({ where: { tenantId: tenants } });
        await tx.tenantNotificationEmailPolicy.deleteMany({ where: { tenantId: tenants } });
        await tx.payment.deleteMany({ where: { tenantId: tenants } });
        await tx.payable.deleteMany({ where: { tenantId: tenants } });
        await tx.supplierInvoiceLine.deleteMany({ where: { invoice: { tenantId: tenants } } });
        await tx.supplierInvoice.deleteMany({ where: { tenantId: tenants, documentKind: { not: "INVOICE" } } });
        await tx.supplierInvoice.deleteMany({ where: { tenantId: tenants } });
        await tx.purchaseReceiptLine.deleteMany({ where: { purchaseReceipt: { tenantId: tenants } } });
        await tx.purchaseReceipt.deleteMany({ where: { tenantId: tenants } });
        await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrder: { tenantId: tenants } } });
        await tx.purchaseOrder.deleteMany({ where: { tenantId: tenants } });
        await tx.procurementQuoteLine.deleteMany({ where: { procurementQuote: { tenantId: tenants } } });
        await tx.procurementQuote.deleteMany({ where: { tenantId: tenants } });
        await tx.purchaseRequestLine.deleteMany({ where: { purchaseRequest: { tenantId: tenants } } });
        await tx.purchaseRequest.deleteMany({ where: { tenantId: tenants } });
        await tx.auditLog.deleteMany({ where: { tenantId: tenants } });
        await tx.costAnalysisLine.deleteMany({ where: { budget: { tenantId: tenants } } });
        await tx.costItem.deleteMany({ where: { budget: { tenantId: tenants } } });
        await tx.wbsNode.deleteMany({ where: { budget: { tenantId: tenants } } });
        await tx.budget.deleteMany({ where: { tenantId: tenants } });
        await tx.projectMembership.deleteMany({ where: { tenantId: tenants } });
        await tx.project.deleteMany({ where: { tenantId: tenants } });
        await tx.contactRole.deleteMany({ where: { tenantId: tenants } });
        await tx.contact.deleteMany({ where: { tenantId: tenants } });
        await tx.companyProcurementSettings.deleteMany({ where: { companyId: { in: [companyId, otherCompanyId, foreignCompanyId] } } });
        await tx.userMembership.deleteMany({ where: { tenantId: tenants } });
        await tx.tenantModuleSetting.deleteMany({ where: { tenantId: tenants } });
        await tx.company.deleteMany({ where: { tenantId: tenants } });
        await tx.tenant.deleteMany({ where: { id: tenants } });
        await tx.user.deleteMany({ where: { id: { in: userIds } } });
      }, { timeout: 30_000 });
    } finally { await prisma.$disconnect(); }
  });

  async function scope(currency = "ARS") {
    const projectId = randomUUID(), budgetId = randomUUID(), wbsNodeId = randomUUID();
    await prisma.$transaction(async (tx) => {
      await tx.project.create({ data: { id: projectId, tenantId, companyId: null, clientContactId: contactId, name: "Synthetic AG06 shared project", code: randomUUID(), status: "ACTIVE", country: "AR" } });
      await tx.projectMembership.createMany({ data: userIds.map((userId) => ({ tenantId, projectId, userId })) });
      await tx.budget.create({ data: { id: budgetId, tenantId, companyId: null, projectId, name: "Synthetic AG06 shared budget", versionNumber: 1, currency, status: "APPROVED" } });
      await tx.wbsNode.create({ data: { id: wbsNodeId, budgetId, code: "1", name: "Synthetic AG06 item", type: "ITEM" } });
      await tx.costItem.create({ data: { budgetId, wbsNodeId, unit: "un", quantity: 10, unitCostDirect: 10, totalCostDirect: 100, unitSalePrice: 15, totalSalePrice: 150 } });
    }, { timeout: 30_000 });
    return { projectId, budgetId, wbsNodeId, currency };
  }
  type Scope = Awaited<ReturnType<typeof scope>>;

  async function po(s: Scope, options: { company?: string; status?: "DRAFT" | "SUBMITTED" | "CONFIRMED" | "PARTIALLY_RECEIVED"; received?: number } = {}) {
    return prisma.purchaseOrder.create({ data: {
      tenantId, companyId: options.company ?? companyId, projectId: s.projectId, supplierContactId: contactId,
      number: ++number, issueDate: today, currency: s.currency, fxRate: s.currency === "ARS" ? 1 : "1234.567890",
      subtotal: 100, totalAmount: 100, totalAmountArs: s.currency === "ARS" ? "100" : "123456.79", status: options.status ?? "CONFIRMED",
      lines: { create: { wbsNodeId: s.wbsNodeId, description: "Synthetic AG06 purchase", unit: "un", quantity: 10, unitPrice: 10, lineSubtotal: 100, lineTotal: 100, receivedQuantity: options.received ?? 4 } },
    }, include: { lines: true } });
  }
  type Order = Awaited<ReturnType<typeof po>>;

  async function invoice(order: Order, options: { company?: string; currency?: string; linkedLineId?: string | null; amount?: number } = {}) {
    const amount = options.amount ?? 10, currency = options.currency ?? order.currency;
    return prisma.supplierInvoice.create({ data: {
      tenantId, companyId: options.company ?? order.companyId, projectId: order.projectId, supplierContactId: contactId,
      purchaseOrderId: order.id, number: ++number, issueDate: today, dueDate: today, status: "ISSUED", currency,
      fxRate: currency === "ARS" ? 1 : 1400, amountArs: new Prisma.Decimal(amount).mul(currency === "ARS" ? 1 : 1400).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP), subtotal: amount, totalAmount: amount,
      lines: { create: { wbsNodeId: order.lines[0]!.wbsNodeId, purchaseOrderLineId: options.linkedLineId === undefined ? order.lines[0]!.id : options.linkedLineId, description: "Synthetic AG06 invoice", quantity: 1, unitPrice: amount, lineSubtotal: amount, lineTotal: amount } },
    } });
  }

  async function request(s: Scope, company = companyId, options: { quote?: boolean; stale?: boolean } = {}) {
    const row = await prisma.purchaseRequest.create({ data: {
      tenantId, companyId: company, projectId: s.projectId, number: ++number, status: "SUBMITTED", requestedByUserId: ownerId,
      neededByDate: today,
      submittedAt: options.stale ? new Date(Date.now() - 5 * 86_400_000) : new Date(),
      lines: { create: { wbsNodeId: s.wbsNodeId, description: "Synthetic AG06 request", unit: "un", quantity: 1, budgetUnitCostSnapshot: 10 } },
    }, include: { lines: true } });
    if (options.quote) await prisma.procurementQuote.create({ data: {
      tenantId, purchaseRequestId: row.id, supplierContactId: contactId, status: "RECEIVED", currency: s.currency, subtotal: 10, totalAmount: 10, totalAmountArs: 10,
      lines: { create: { purchaseRequestLineId: row.lines[0]!.id, unitPrice: 10, lineSubtotal: 10, lineTotal: 10 } },
    } });
    return row;
  }

  async function receipt(order: Order, quantities = [4, 4], company = order.companyId) {
    return prisma.purchaseReceipt.create({ data: {
      tenantId, companyId: company, projectId: order.projectId, purchaseOrderId: order.id, supplierContactId: contactId, receiptDate: today, status: "CONFIRMED",
      lines: { create: quantities.map((quantityReceived) => ({ purchaseOrderLineId: order.lines[0]!.id, quantityReceived })) },
    } });
  }

  it("rejects invalid direct policy input before replacing stored values", async () => {
    await upsertCompanyProcurementSettings(companyId, { minQuotesRequired: 2, maxQuotesAllowed: 3 }, ctx);
    await assert.rejects(() => upsertCompanyProcurementSettings(companyId, { minQuotesRequired: 0 }, ctx), isError("VALIDATION"));
    assert.equal((await getCompanyProcurementSettings(companyId, ctx)).minQuotesRequired, 2);
  });

  it("validates partial policy changes against the stored complementary limit", async () => {
    await assert.rejects(() => upsertCompanyProcurementSettings(companyId, { maxQuotesAllowed: 1 }, ctx), isError("VALIDATION"));
    assert.equal((await getCompanyProcurementSettings(companyId, ctx)).maxQuotesAllowed, 3);
  });

  it("serializes concurrent individually valid policy changes without storing min greater than max", async () => {
    const results = await Promise.allSettled([
      upsertCompanyProcurementSettings(companyId, { minQuotesRequired: 3 }, ctx),
      upsertCompanyProcurementSettings(companyId, { maxQuotesAllowed: 2 }, ctx),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const rejected = results.find((result) => result.status === "rejected");
    assert.ok(rejected?.status === "rejected" && isError("VALIDATION")(rejected.reason));
    const saved = await getCompanyProcurementSettings(companyId, ctx);
    assert.ok(saved.minQuotesRequired <= saved.maxQuotesAllowed);
  });

  it("rounds policy money and records a scoped before/after audit atomically", async () => {
    const saved = await upsertCompanyProcurementSettings(companyId, { poApprovalThresholdArs: "100.005" }, ctx);
    assert.equal(saved.poApprovalThresholdArs, "100.01");
    const row = await prisma.companyProcurementSettings.findUniqueOrThrow({ where: { companyId } });
    assert.equal(row.poApprovalThresholdArs?.toFixed(4), "100.0100");
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { tenantId, entityId: row.id, action: "company_procurement_settings.updated" }, orderBy: { createdAt: "desc" } });
    assert.equal(audit.companyId, companyId);
    assert.equal(audit.actorUserId, ownerId);
    assert.equal((audit.after as Record<string, unknown>).poApprovalThresholdArs, "100.01");
  });

  it("rolls policy changes back when audit insertion fails", async () => {
    const beforeRow = await prisma.companyProcurementSettings.findUniqueOrThrow({ where: { companyId } });
    const originalTransaction = prisma.$transaction;
    const transaction = originalTransaction.bind(prisma);
    const failingTransaction = async (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options: object) => transaction(async (tx) => {
      const failingAudit = new Proxy(tx.auditLog, { get(target, key) { return key === "create" ? async () => { throw new Error("synthetic audit failure"); } : Reflect.get(target, key); } });
      const wrapped = new Proxy(tx, { get(target, key) { return key === "auditLog" ? failingAudit : Reflect.get(target, key); } });
      return work(wrapped);
    }, options);
    prisma.$transaction = failingTransaction as typeof prisma.$transaction;
    try {
      await assert.rejects(() => upsertCompanyProcurementSettings(companyId, { allowDirectPo: !beforeRow.allowDirectPo }, ctx), /synthetic audit failure/);
    } finally {
      prisma.$transaction = originalTransaction;
    }
    const afterRow = await prisma.companyProcurementSettings.findUniqueOrThrow({ where: { companyId } });
    assert.equal(afterRow.allowDirectPo, beforeRow.allowDirectPo);
    assert.equal(afterRow.updatedAt.getTime(), beforeRow.updatedAt.getTime());
  });

  it("preserves company isolation even for an owner changing policies", async () => {
    await assert.rejects(() => upsertCompanyProcurementSettings(otherCompanyId, {}, ctx), isError("FORBIDDEN"));
  });

  it("resolves shared-project policy from the selected company without guessing for a global context", async () => {
    const s = await scope();
    assert.equal((await getCompanyProcurementSettingsForProject(s.projectId, ctx)).companyId, companyId);
    await assert.rejects(() => getCompanyProcurementSettingsForProject(s.projectId, { ...ctx, companyId: null, actorUserId: globalOwnerId }), isError("CONFLICT"));
  });

  it("counts only own-company requests, quotes, orders and receipts in a shared-project hub", async () => {
    const s = await scope();
    await request(s, companyId, { quote: true }); await request(s); await request(s, otherCompanyId, { quote: true });
    await po(s, { status: "DRAFT" }); await po(s, { company: otherCompanyId, status: "DRAFT" });
    const received = await po(s); await receipt(received, [4]);
    const hub = await getProjectProcurementHub(s.projectId, ctx);
    assert.equal(hub.purchaseRequests.submitted, 2); assert.equal(hub.purchaseRequests.awaitingQuotes, 1);
    assert.equal(hub.purchaseOrders.draft, 1); assert.equal(hub.receipts.recentConfirmed, 1);
    assert.equal(hub.canViewOrders, true);
  });

  it("keeps SC-only hub access without consulting hidden orders or receipts", async () => {
    assert.equal(canViewPurchaseRequests(foreman.roles), true); assert.equal(canViewProcurementProjectArea(foreman.roles), false);
    const s = await scope(); await request(s); await po(s);
    const orderCount = prisma.purchaseOrder.count, receiptCount = prisma.purchaseReceipt.count;
    prisma.purchaseOrder.count = (async () => { throw new Error("hidden PO source read"); }) as typeof orderCount;
    prisma.purchaseReceipt.count = (async () => { throw new Error("hidden receipt source read"); }) as typeof receiptCount;
    try {
      const hub = await getProjectProcurementHub(s.projectId, foreman);
      assert.equal(hub.purchaseRequests.submitted, 1); assert.equal(hub.canViewOrders, false);
    } finally {
      prisma.purchaseOrder.count = orderCount; prisma.purchaseReceipt.count = receiptCount;
    }
  });

  it("honors the project module gate before hub source reads", async () => {
    const s = await scope();
    await prisma.tenantModuleSetting.create({ data: { tenantId, moduleKey: "PROJECTS", isEnabled: false } });
    try { await assert.rejects(() => getProjectProcurementHub(s.projectId, ctx), isError("FORBIDDEN")); }
    finally { await prisma.tenantModuleSetting.deleteMany({ where: { tenantId, moduleKey: "PROJECTS" } }); }
  });

  it("filters shared-project procurement audiences by document company and active user", async () => {
    const s = await scope();
    const recipients = await filterProcurementNotificationRecipients({ tenantId, companyId, projectId: s.projectId, candidateUserIds: userIds });
    assert.ok(recipients.includes(procurementId)); assert.ok(recipients.includes(globalOwnerId));
    assert.ok(!recipients.includes(otherOwnerId)); assert.ok(!recipients.includes(inactiveUserId));
  });

  it("creates SC submission notices only for eligible own-company and global recipients", async () => {
    const s = await scope(), pr = await request(s);
    await notifyPurchaseRequestSubmitted({ ctx, purchaseRequestId: pr.id, projectId: s.projectId, companyId, code: `SC-${pr.number}` });
    const notices = await prisma.notification.findMany({ where: { tenantId, linkedEntityId: pr.id } });
    assert.ok(notices.some((row) => row.recipientUserId === procurementId));
    assert.ok(notices.some((row) => row.recipientUserId === globalOwnerId));
    assert.ok(!notices.some((row) => row.recipientUserId === otherOwnerId || row.recipientUserId === inactiveUserId));
  });

  it("runs manual SLA reminders only within the active company", async () => {
    const s = await scope(), own = await request(s, companyId, { stale: true }), other = await request(s, otherCompanyId, { stale: true });
    const result = await runProcurementSlaReminders(ctx);
    assert.ok(result.createdCount > 0);
    assert.ok(await prisma.notification.count({ where: { tenantId, linkedEntityId: own.id, type: "PROCUREMENT_SLA_REMINDER" } }) > 0);
    assert.equal(await prisma.notification.count({ where: { tenantId, linkedEntityId: other.id, type: "PROCUREMENT_SLA_REMINDER" } }), 0);
  });

  it("keeps billing in the PO native currency rather than relabeling USD as ARS", async () => {
    const s = await scope("USD"), order = await po(s), inv = await invoice(order);
    await prisma.payable.create({ data: { tenantId, companyId, projectId: s.projectId, supplierContactId: contactId, supplierInvoiceId: inv.id, issueDate: today, dueDate: today, currency: "USD", originalAmount: 10, paidAmount: 5, status: "PARTIAL" } });
    const billing = await getPurchaseOrderBillingSummary(order.id, ctx);
    assert.equal(billing.currency, "USD"); assert.equal(billing.receivedAmount, "40.00");
    assert.equal(billing.invoicedAmount, "10.00"); assert.equal(billing.paidAmount, "5.00"); assert.equal(billing.pendingToInvoice, "30.00");
  });

  it("rejects a mixed-currency billing calculation while retaining readable original documents", async () => {
    const s = await scope("USD"), order = await po(s); await invoice(order, { currency: "ARS" });
    await assert.rejects(() => getPurchaseOrderBillingSummary(order.id, ctx), isError("VALIDATION"));
    const documents = await listSupplierInvoicesByPurchaseOrder(order.id, ctx);
    assert.equal(documents.length, 1); assert.equal(documents[0]!.currency, "ARS");
    assert.equal(documents[0]!.totalAmount, "10.00"); assert.equal(documents[0]!.fxRate, "1.000000"); assert.equal(documents[0]!.amountArs, "10.00");
  });

  it("rejects contradictory invoice-company parents before billing or listing them", async () => {
    const s = await scope(), order = await po(s); await invoice(order, { company: otherCompanyId });
    for (const read of [getPurchaseOrderBillingSummary, listSupplierInvoicesByPurchaseOrder]) await assert.rejects(() => read(order.id, ctx), isError("CONFLICT"));
  });

  it("rejects a foreign PO-line FK even within the same company and project", async () => {
    const s = await scope(), order = await po(s), other = await po(s); await invoice(order, { linkedLineId: other.lines[0]!.id });
    await assert.rejects(() => getPurchaseOrderBillingSummary(order.id, ctx), isError("CONFLICT"));
  });

  it("rejects an inconsistent payable before using its paid amount", async () => {
    const s = await scope(), order = await po(s), inv = await invoice(order);
    await prisma.payable.create({ data: { tenantId, companyId: otherCompanyId, projectId: s.projectId, supplierContactId: contactId, supplierInvoiceId: inv.id, issueDate: today, dueDate: today, currency: "ARS", originalAmount: 10, paidAmount: 5, status: "PARTIAL" } });
    await assert.rejects(() => getPurchaseOrderBillingSummary(order.id, ctx), isError("CONFLICT"));
  });

  it("keeps fiscal NC and ND separate from physical receipt coverage", async () => {
    const s = await scope(), order = await po(s), parent = await invoice(order), beforeSummary = await getPurchaseOrderBillingSummary(order.id, ctx);
    for (const documentKind of ["CREDIT_NOTE", "DEBIT_NOTE"] as const) await prisma.supplierInvoice.create({ data: {
      tenantId, companyId, projectId: s.projectId, supplierContactId: contactId, number: ++number, issueDate: today, dueDate: today, status: "ISSUED", currency: "ARS", subtotal: 5, totalAmount: 5, amountArs: 5,
      documentKind, referencedSupplierInvoiceId: parent.id,
      lines: { create: { wbsNodeId: s.wbsNodeId, description: "Synthetic fiscal adjustment", quantity: 1, unitPrice: 5, lineSubtotal: 5, lineTotal: 5 } },
    } });
    assert.deepEqual(await getPurchaseOrderBillingSummary(order.id, ctx), beforeSummary);
  });

  it("sums repeated receipt lines when creating the real automatic AP draft", async () => {
    const s = await scope(), order = await po(s, { received: 8, status: "PARTIALLY_RECEIVED" }), received = await receipt(order);
    const draft = await createSupplierInvoiceDraftFromPurchaseOrder({ projectId: s.projectId, purchaseOrderId: order.id, purchaseReceiptId: received.id, basis: "received" }, ctx);
    assert.equal(draft.status, "DRAFT"); assert.equal(draft.lines.length, 1); assert.equal(draft.lines[0]!.quantity, "8.0000");
    assert.equal(await prisma.payable.count({ where: { supplierInvoiceId: draft.id } }), 0);
  });

  it("rejects a foreign-budget OC in AP preview and generation without creating an invoice", async () => {
    const s = await scope(), order = await po(s);
    await prisma.budget.update({ where: { id: s.budgetId }, data: { companyId: otherCompanyId } });
    const count = await prisma.supplierInvoice.count({ where: { tenantId } });
    await assert.rejects(() => getPurchaseOrderInvoiceDraftPreview(order.id, s.projectId, ctx), isError("CONFLICT"));
    await assert.rejects(() => createSupplierInvoiceDraftFromPurchaseOrder({ projectId: s.projectId, purchaseOrderId: order.id, basis: "received" }, ctx), isError("CONFLICT"));
    assert.equal(await prisma.supplierInvoice.count({ where: { tenantId } }), count);
  });

  it("rejects cross-company OC headers in manual invoice creation, editing and issue", async () => {
    const s = await scope(), foreignOrder = await po(s, { company: otherCompanyId });
    const count = await prisma.supplierInvoice.count({ where: { tenantId } });
    await assert.rejects(() => createSupplierInvoice({ projectId: s.projectId, supplierContactId: contactId,
      purchaseOrderId: foreignOrder.id, issueDate: "2026-11-04", dueDate: "2026-12-04", currency: "ARS", invoiceLetter: "C", iibbPerceptionRate: "0",
      lines: [{ description: "Synthetic manual", sortOrder: 0, quantity: "1", unitPrice: "10", taxRate: "0", discountPct: "0", wbsNodeId: s.wbsNodeId }],
    }, ctx), isError("FORBIDDEN"));
    assert.equal(await prisma.supplierInvoice.count({ where: { tenantId } }), count);
    const ownOrder = await po(s), inv = await invoice(ownOrder);
    await prisma.supplierInvoice.update({ where: { id: inv.id }, data: { status: "DRAFT" } });
    await assert.rejects(() => updateSupplierInvoice(inv.id, { purchaseOrderId: foreignOrder.id }, ctx), isError("FORBIDDEN"));
    assert.equal((await prisma.supplierInvoice.findUniqueOrThrow({ where: { id: inv.id } })).purchaseOrderId, ownOrder.id);
    await prisma.supplierInvoice.update({ where: { id: inv.id }, data: { purchaseOrderId: foreignOrder.id } });
    await assert.rejects(() => issueSupplierInvoice(inv.id, ctx), isError("FORBIDDEN"));
    assert.equal((await prisma.supplierInvoice.findUniqueOrThrow({ where: { id: inv.id } })).status, "DRAFT");
  });

  it("rejects a stale partial invoice edit after another edit changes its OC and supplier", async () => {
    const s = await scope(), originalOrder = await po(s), targetOrder = await po(s), inv = await invoice(originalOrder);
    const targetSupplierId = randomUUID();
    await prisma.contact.create({ data: { id: targetSupplierId, tenantId, legalName: "Synthetic AG06 second supplier", country: "AR" } });
    await prisma.contactRole.create({ data: { tenantId, contactId: targetSupplierId, role: "SUPPLIER", status: "ACTIVE" } });
    await prisma.purchaseOrder.update({ where: { id: targetOrder.id }, data: { supplierContactId: targetSupplierId } });
    await prisma.supplierInvoice.update({ where: { id: inv.id }, data: { status: "DRAFT" } });
    const original = prisma.$transaction, transact = original.bind(prisma);
    let release!: () => void, reached!: () => void, intercepted = false;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const atTransaction = new Promise<void>((resolve) => { reached = resolve; });
    prisma.$transaction = (async (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options: object) => {
      if (!intercepted) { intercepted = true; reached(); await gate; }
      return transact(work, options);
    }) as typeof prisma.$transaction;
    const staleEdit = updateSupplierInvoice(inv.id, { supplierContactId: contactId }, ctx);
    try {
      await Promise.race([atTransaction, staleEdit.then(() => { throw new Error("Expected transaction boundary"); })]);
      await updateSupplierInvoice(inv.id, { supplierContactId: targetSupplierId, purchaseOrderId: targetOrder.id,
        lines: [{ description: "Synthetic retarget", quantity: "1", unitPrice: "10", taxRate: "0", discountPct: "0", sortOrder: 0,
          wbsNodeId: s.wbsNodeId, purchaseOrderLineId: targetOrder.lines[0]!.id }],
      }, ctx);
      release();
      await assert.rejects(staleEdit, isError("CONFLICT"));
      const saved = await prisma.supplierInvoice.findUniqueOrThrow({ where: { id: inv.id }, include: { lines: true } });
      assert.equal(saved.purchaseOrderId, targetOrder.id); assert.equal(saved.supplierContactId, targetSupplierId);
      assert.equal(saved.lines[0]!.purchaseOrderLineId, targetOrder.lines[0]!.id);
    } finally { release(); prisma.$transaction = original; await staleEdit.catch(() => undefined); }
  });

  it("rejects a receipt-company contradiction before creating an AP draft", async () => {
    const s = await scope(), order = await po(s), received = await receipt(order, [4], otherCompanyId);
    await assert.rejects(() => createSupplierInvoiceDraftFromPurchaseOrder({ projectId: s.projectId, purchaseOrderId: order.id, purchaseReceiptId: received.id, basis: "received" }, ctx), isError("CONFLICT"));
    assert.equal(await prisma.supplierInvoice.count({ where: { purchaseOrderId: order.id } }), 0);
  });

  it("does not overwrite a native-priced automatic draft after its currency changes", async () => {
    const s = await scope("USD"), order = await po(s);
    const created = await createSupplierInvoiceDraftFromPurchaseOrder({ projectId: s.projectId, purchaseOrderId: order.id, basis: "received" }, ctx);
    await prisma.supplierInvoice.update({ where: { id: created.id }, data: { currency: "ARS", fxRate: 1 } });
    const beforeDraft = await prisma.supplierInvoice.findUniqueOrThrow({ where: { id: created.id }, include: { lines: true } });
    await assert.rejects(() => createSupplierInvoiceDraftFromPurchaseOrder({ projectId: s.projectId, purchaseOrderId: order.id, basis: "received" }, ctx), isError("CONFLICT"));
    assert.deepEqual(await prisma.supplierInvoice.findUniqueOrThrow({ where: { id: created.id }, include: { lines: true } }), beforeDraft);
  });

  it("does not claim an amount over-receipt from incompatible invoice and PO currencies", async () => {
    const s = await scope("USD"), order = await po(s), inv = await invoice(order, { currency: "ARS", amount: 1_000_000 });
    const warnings = await getSupplierInvoicePurchaseOrderWarnings(inv.id, ctx);
    assert.ok(warnings.some((warning) => warning.includes("moneda")));
    assert.ok(!warnings.some((warning) => warning.startsWith("El neto+IVA")));
  });

  async function invoiceWithIibb(order: Order) {
    return prisma.supplierInvoice.create({ data: {
      tenantId, companyId: order.companyId, projectId: order.projectId, supplierContactId: contactId,
      purchaseOrderId: order.id, number: ++number, issueDate: today, dueDate: today, status: "ISSUED", currency: "ARS",
      fxRate: "1", amountArs: "124", subtotal: "100", taxAmount: "21", totalAmount: "124",
      iibbPerceptionRate: "3", iibbPerceptionAmount: "3",
      lines: { create: {
        wbsNodeId: order.lines[0]!.wbsNodeId, purchaseOrderLineId: order.lines[0]!.id,
        description: "Synthetic AG06 invoice with IIBB", quantity: "1", unitPrice: "100", taxRate: "21",
        lineSubtotal: "100", lineTax: "21", lineTotal: "121",
      } },
    } });
  }

  it("does not settle an OC at neto+IVA while its issued invoice still owes IIBB", async () => {
    const s = await scope(), order = await po(s);
    assert.equal((await getPurchaseOrderBillingSummary(order.id, ctx)).allIssuedInvoicesSettled, false);
    const inv = await invoiceWithIibb(order);
    assert.equal((await getPurchaseOrderBillingSummary(order.id, ctx)).allIssuedInvoicesSettled, false);
    const payable = await prisma.payable.create({ data: {
      tenantId, companyId, projectId: s.projectId, supplierContactId: contactId, supplierInvoiceId: inv.id,
      issueDate: today, dueDate: today, currency: "ARS", originalAmount: "124", paidAmount: "121", creditedAmount: "0", status: "PARTIAL",
    } });
    const partial = await getPurchaseOrderBillingSummary(order.id, ctx);
    assert.equal(partial.invoicedAmount, "121.00"); assert.equal(partial.paidAmount, "121.00");
    assert.equal(partial.allIssuedInvoicesSettled, false);
    await prisma.payable.update({ where: { id: payable.id }, data: { status: "PAID" } });
    assert.equal((await getPurchaseOrderBillingSummary(order.id, ctx)).allIssuedInvoicesSettled, false);
    await prisma.payable.update({ where: { id: payable.id }, data: { paidAmount: "124", status: "PAID" } });
    const settled = await getPurchaseOrderBillingSummary(order.id, ctx);
    assert.equal(settled.invoicedAmount, "121.00"); assert.equal(settled.paidAmount, "124.00");
    assert.equal(settled.allIssuedInvoicesSettled, true);
  });

  it("settles every issued invoice through canonical credits without claiming a cash payment", async () => {
    const s = await scope(), order = await po(s), inv = await invoiceWithIibb(order);
    await prisma.payable.create({ data: {
      tenantId, companyId, projectId: s.projectId, supplierContactId: contactId, supplierInvoiceId: inv.id,
      issueDate: today, dueDate: today, currency: "ARS", originalAmount: "124", paidAmount: "0", creditedAmount: "124", status: "PAID",
    } });
    const credited = await getPurchaseOrderBillingSummary(order.id, ctx);
    assert.equal(credited.allIssuedInvoicesSettled, true); assert.equal(credited.paidAmount, "0.00");
    const legacy = await invoiceWithIibb(order);
    assert.equal((await getPurchaseOrderBillingSummary(order.id, ctx)).allIssuedInvoicesSettled, false);
    const cancelled = await prisma.payable.create({ data: {
      tenantId, companyId, projectId: s.projectId, supplierContactId: contactId, supplierInvoiceId: legacy.id,
      issueDate: today, dueDate: today, currency: "ARS", originalAmount: "124", paidAmount: "0", creditedAmount: "124", status: "CANCELLED",
    } });
    assert.equal((await getPurchaseOrderBillingSummary(order.id, ctx)).allIssuedInvoicesSettled, false);
    await prisma.payable.update({ where: { id: cancelled.id }, data: { status: "PAID" } });
    const allSettled = await getPurchaseOrderBillingSummary(order.id, ctx);
    assert.equal(allSettled.allIssuedInvoicesSettled, true); assert.equal(allSettled.paidAmount, "0.00");
  });

  it("keeps draft reservations separate from issued coverage when deriving OC completion", async () => {
    const s = await scope(), order = await po(s);
    await prisma.purchaseOrder.update({ where: { id: order.id }, data: {
      status: "RECEIVED", subtotal: "200", totalAmount: "200", totalAmountArs: "200",
      lines: { update: { where: { id: order.lines[0]!.id }, data: {
        quantity: "20", receivedQuantity: "20", lineSubtotal: "200", lineTotal: "200",
      } } },
    } });
    assert.equal((await getPurchaseOrderBillingSummary(order.id, ctx)).allReceivedAmountIssued, false);
    const issued = await invoice(order, { amount: 100 }), draft = await invoice(order, { amount: 100 });
    await prisma.supplierInvoiceLine.updateMany({ where: { invoiceId: { in: [issued.id, draft.id] } }, data: { quantity: "10", unitPrice: "10" } });
    await prisma.supplierInvoice.update({ where: { id: draft.id }, data: { status: "DRAFT" } });
    await prisma.payable.create({ data: {
      tenantId, companyId, projectId: s.projectId, supplierContactId: contactId, supplierInvoiceId: issued.id,
      issueDate: today, dueDate: today, currency: "ARS", originalAmount: "100", paidAmount: "100", status: "PAID",
    } });
    const reserved = await getPurchaseOrderBillingSummary(order.id, ctx);
    assert.equal(reserved.receivedAmount, "200.00"); assert.equal(reserved.invoicedAmount, "100.00");
    assert.equal(reserved.draftReservedAmount, "100.00"); assert.equal(reserved.pendingToInvoice, "0.00");
    assert.equal(reserved.allReceivedAmountIssued, false); assert.equal(reserved.allIssuedInvoicesSettled, true);
    await prisma.supplierInvoice.update({ where: { id: draft.id }, data: { status: "ISSUED" } });
    const invoiced = await getPurchaseOrderBillingSummary(order.id, ctx);
    assert.equal(invoiced.invoicedAmount, "200.00"); assert.equal(invoiced.draftReservedAmount, "0.00");
    assert.equal(invoiced.allReceivedAmountIssued, true); assert.equal(invoiced.allIssuedInvoicesSettled, false);
    await prisma.payable.create({ data: {
      tenantId, companyId, projectId: s.projectId, supplierContactId: contactId, supplierInvoiceId: draft.id,
      issueDate: today, dueDate: today, currency: "ARS", originalAmount: "100", paidAmount: "100", status: "PAID",
    } });
    const complete = await getPurchaseOrderBillingSummary(order.id, ctx);
    assert.equal(complete.allReceivedAmountIssued, true); assert.equal(complete.allIssuedInvoicesSettled, true);
  });

  it("keeps issued debit-note debt in OC settlement without altering physical coverage", async () => {
    const s = await scope(), order = await po(s), inv = await invoiceWithIibb(order);
    const invoicePayable = await prisma.payable.create({ data: {
      tenantId, companyId, projectId: s.projectId, supplierContactId: contactId, supplierInvoiceId: inv.id,
      issueDate: today, dueDate: today, currency: "ARS", originalAmount: "124", paidAmount: "0", creditedAmount: "124", status: "PAID",
    } });
    const beforeSummary = await getPurchaseOrderBillingSummary(order.id, ctx);
    assert.equal(beforeSummary.allIssuedInvoicesSettled, true);
    const note = await prisma.supplierInvoice.create({ data: {
      tenantId, companyId, projectId: s.projectId, supplierContactId: contactId, number: ++number,
      documentKind: "DEBIT_NOTE", referencedSupplierInvoiceId: inv.id, purchaseOrderId: null,
      issueDate: today, dueDate: today, status: "ISSUED", currency: "ARS", fxRate: "1", amountArs: "12", subtotal: "12", totalAmount: "12",
      lines: { create: { wbsNodeId: s.wbsNodeId, description: "Synthetic AG06 debit adjustment", quantity: "1", unitPrice: "12", lineSubtotal: "12", lineTotal: "12" } },
    } });
    assert.equal((await getPurchaseOrderBillingSummary(order.id, ctx)).allIssuedInvoicesSettled, false);
    const payable = await prisma.payable.create({ data: {
      tenantId, companyId, projectId: s.projectId, supplierContactId: contactId, supplierInvoiceId: note.id,
      issueDate: today, dueDate: today, currency: "ARS", originalAmount: "12", paidAmount: "0", status: "OPEN",
    } });
    const withOpenNote = await getPurchaseOrderBillingSummary(order.id, ctx);
    assert.equal(withOpenNote.allIssuedInvoicesSettled, false);
    assert.deepEqual(withOpenNote, { ...beforeSummary, allIssuedInvoicesSettled: false });
    await prisma.payable.update({ where: { id: invoicePayable.id }, data: { paidAmount: "100", creditedAmount: "24" } });
    const withInvoiceCash = await getPurchaseOrderBillingSummary(order.id, ctx);
    assert.equal(withInvoiceCash.paidAmount, "100.00"); assert.equal(withInvoiceCash.allIssuedInvoicesSettled, false);
    await prisma.payable.update({ where: { id: payable.id }, data: { paidAmount: "12", status: "CANCELLED" } });
    const cancelledNote = await getPurchaseOrderBillingSummary(order.id, ctx);
    assert.equal(cancelledNote.allIssuedInvoicesSettled, false); assert.equal(cancelledNote.paidAmount, "100.00");
    await prisma.payable.update({ where: { id: payable.id }, data: { paidAmount: "12", status: "PAID" } });
    assert.deepEqual(await getPurchaseOrderBillingSummary(order.id, ctx), { ...beforeSummary, paidAmount: "112.00" });
    await prisma.supplierInvoice.update({ where: { id: note.id }, data: { purchaseOrderId: order.id } });
    assert.equal((await getPurchaseOrderBillingSummary(order.id, ctx)).allIssuedInvoicesSettled, true);
    const other = await po(s);
    await prisma.supplierInvoice.update({ where: { id: note.id }, data: { purchaseOrderId: other.id } });
    await assert.rejects(() => getPurchaseOrderBillingSummary(order.id, ctx), isError("CONFLICT"));
    await prisma.supplierInvoice.update({ where: { id: note.id }, data: { purchaseOrderId: null, companyId: otherCompanyId } });
    await assert.rejects(() => getPurchaseOrderBillingSummary(order.id, ctx), isError("CONFLICT"));
  });
});
