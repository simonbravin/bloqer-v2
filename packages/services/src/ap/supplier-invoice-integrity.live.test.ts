import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { prisma } from "@bloqer/database";

import { createProcurementRegressionFixtures } from "../procurement/fixtures/procurement-regression";
import { ServiceError } from "../types";
import { clearProjectAccessModeCache } from "../security/access";
import { getProjectAccruedTotal } from "../cost-control/project-accrued-aggregation";
import {
  createSupplierInvoiceDraftFromPurchaseOrder,
  getPurchaseOrderBillingSummary,
  getSupplierInvoicePurchaseOrderWarnings,
  getPurchaseOrderInvoiceDraftPreview,
  listSupplierInvoicesByPurchaseOrder,
} from "./supplier-invoice-from-po.service";
import { cancelSupplierInvoice, createSupplierInvoice, issueSupplierInvoice, updateSupplierInvoice } from "./supplier-invoice.service";
import {
  cancelSupplierCreditNote, createSupplierCreditNoteFromInvoice,
  createSupplierDebitNoteFromInvoice, issueSupplierCreditNote, issueSupplierDebitNote,
} from "./credit-debit-note.service";

describe("AP integrity (isolated database)", {
  skip: process.env.BLOQER_PROCUREMENT_LIVE_DB !== "1",
  concurrency: false,
}, () => {
  let fx: Awaited<ReturnType<typeof createProcurementRegressionFixtures>>;
  before(async () => { fx = await createProcurementRegressionFixtures(prisma); });
  after(async () => { await prisma.$disconnect(); });

  it("rejects billing reads from a different active company", async () => {
    const ctx = { ...fx.ctx, companyId: fx.otherTenantCtx.companyId };
    for (const read of [getPurchaseOrderBillingSummary, listSupplierInvoicesByPurchaseOrder]) {
      await assert.rejects(() => read(fx.poId, ctx),
        (error: unknown) => error instanceof ServiceError && error.code === "FORBIDDEN");
    }
  });

  it("rejects removing the source PO line from an automatic invoice", async () => {
    const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: fx.poId } });
    const draft = await createSupplierInvoiceDraftFromPurchaseOrder({
      projectId: po.projectId, purchaseOrderId: po.id, basis: "remaining",
    }, fx.ctx);
    const line = draft.lines[0]!;
    await assert.rejects(() => updateSupplierInvoice(draft.id, { lines: [{
      id: line.id, description: line.description, quantity: line.quantity,
      unitPrice: line.unitPrice, taxRate: line.taxRate, discountPct: line.discountPct,
      wbsNodeId: line.wbsNodeId, purchaseOrderLineId: null, sortOrder: 0,
    }] }, fx.ctx, po.projectId),
    (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT");
    const stored = await prisma.supplierInvoiceLine.findUniqueOrThrow({ where: { id: line.id } });
    assert.equal(stored.purchaseOrderLineId, line.purchaseOrderLineId);
  });

  it("enforces project membership on billing, previews and linked invoices", async () => {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: fx.ctx.tenantId } });
    const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: fx.poId } });
    const ctx = { ...fx.ctx, actorUserId: randomUUID(), roles: ["PROCUREMENT"] as const };
    await prisma.tenant.update({ where: { id: tenant.id }, data: { projectAccessMode: "MEMBERSHIP_SCOPED" } });
    clearProjectAccessModeCache();
    try {
      const scopedCtx = { ...ctx, roles: [...ctx.roles] };
      for (const read of [
        () => getPurchaseOrderBillingSummary(po.id, scopedCtx),
        () => listSupplierInvoicesByPurchaseOrder(po.id, scopedCtx),
        () => getPurchaseOrderInvoiceDraftPreview(po.id, po.projectId, scopedCtx),
        () => getSupplierInvoicePurchaseOrderWarnings(fx.invoiceId, scopedCtx),
        () => cancelSupplierInvoice(fx.invoiceId, scopedCtx, po.projectId),
      ]) {
        await assert.rejects(read, (error: unknown) => error instanceof ServiceError && error.code === "FORBIDDEN");
      }
    } finally {
      await prisma.tenant.update({ where: { id: tenant.id }, data: { projectAccessMode: tenant.projectAccessMode } });
      clearProjectAccessModeCache();
    }
  });

  it("keeps header and line links when editing and issuing an automatic partial invoice", async () => {
    const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: fx.poId } });
    const draft = await createSupplierInvoiceDraftFromPurchaseOrder({
      projectId: po.projectId, purchaseOrderId: po.id, basis: "remaining",
    }, fx.ctx);
    const line = draft.lines[0]!;
    const input = {
      id: line.id, description: "Edited description only", quantity: line.quantity,
      unitPrice: line.unitPrice, taxRate: line.taxRate, discountPct: line.discountPct,
      wbsNodeId: line.wbsNodeId, purchaseOrderLineId: line.purchaseOrderLineId, sortOrder: 0,
    };
    for (const ctx of [fx.otherTenantCtx, { ...fx.ctx, companyId: fx.otherTenantCtx.companyId }]) {
      await assert.rejects(() => updateSupplierInvoice(draft.id, { lines: [input] }, ctx),
        (error: unknown) => error instanceof ServiceError && error.code === "FORBIDDEN");
    }
    await assert.rejects(() => updateSupplierInvoice(draft.id, { lines: [input] }, fx.ctx, randomUUID()),
      (error: unknown) => error instanceof ServiceError && error.code === "FORBIDDEN");
    await assert.rejects(() => updateSupplierInvoice(draft.id, { purchaseOrderId: null }, fx.ctx),
      (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT");
    await assert.rejects(() => updateSupplierInvoice(draft.id, { lines: [{ ...input, purchaseOrderLineId: randomUUID() }] }, fx.ctx),
      (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT");
    const edited = await updateSupplierInvoice(draft.id, { invoiceLetter: "B", lines: [input] }, fx.ctx, po.projectId);
    assert.equal(edited.totalAmount, draft.totalAmount);
    // A malformed historical auto-draft must not create debt before its source is reviewed.
    const editedLine = edited.lines[0]!;
    await prisma.supplierInvoiceLine.update({ where: { id: editedLine.id }, data: { purchaseOrderLineId: null } });
    try {
      await assert.rejects(() => issueSupplierInvoice(draft.id, fx.ctx, po.projectId),
        (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT");
      assert.equal(await prisma.payable.count({ where: { supplierInvoiceId: draft.id } }), 0);
    } finally {
      await prisma.supplierInvoiceLine.update({ where: { id: editedLine.id }, data: { purchaseOrderLineId: line.purchaseOrderLineId } });
    }
    const issued = await issueSupplierInvoice(draft.id, fx.ctx, po.projectId);
    assert.equal(issued.purchaseOrderId, po.id);
    assert.equal(issued.lines[0]!.purchaseOrderLineId, line.purchaseOrderLineId);
    assert.equal(issued.totalAmount, draft.totalAmount);
    assert.equal(await prisma.payable.count({ where: { supplierInvoiceId: draft.id } }), 1);
    await assert.rejects(() => issueSupplierInvoice(draft.id, fx.ctx, po.projectId),
      (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT");
    const summary = await getPurchaseOrderBillingSummary(po.id, fx.ctx);
    assert.equal(summary.invoicedAmount, "605.00");
    assert.equal(summary.paidAmount, "121.00");
    assert.equal(summary.draftReservedAmount, "0.00");
    assert.equal(summary.pendingToInvoice, "0.00");
    assert.equal(summary.unlinkedInvoiceCount, 0);
  });

  it("allows manual header-only invoices and explains incomplete quantity coverage", async () => {
    const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: fx.poId }, include: { lines: true } });
    const manual = await createSupplierInvoice({
      projectId: po.projectId, supplierContactId: po.supplierContactId, purchaseOrderId: po.id,
      issueDate: "2026-10-21", dueDate: "2026-11-21", currency: "ARS", invoiceLetter: "B",
      iibbPerceptionRate: "0", lines: [{ description: "Manual documented adjustment", quantity: "1",
        unitPrice: "10", taxRate: "21", discountPct: "0", wbsNodeId: po.lines[0]!.wbsNodeId, sortOrder: 0 }],
    }, fx.ctx);
    const summary = await getPurchaseOrderBillingSummary(po.id, fx.ctx);
    assert.equal(summary.unlinkedInvoiceCount, 1);
    assert.equal(summary.draftReservedAmount, "12.10");
    assert.ok((await getSupplierInvoicePurchaseOrderWarnings(manual.id, fx.ctx)).some((w) => w.includes("sin vínculo")));
    await cancelSupplierInvoice(manual.id, fx.ctx, po.projectId);
    assert.equal((await getPurchaseOrderBillingSummary(po.id, fx.ctx)).unlinkedInvoiceCount, 0);
  });

  it("keeps credit and debit notes separate from physical receipt coverage and cash", async () => {
    const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: fx.poId }, include: { lines: true } });
    const before = await getPurchaseOrderBillingSummary(po.id, fx.ctx);
    const accruedBefore = await getProjectAccruedTotal(po.projectId, {}, fx.ctx);
    const movements = await prisma.accountMovement.count({ where: { tenantId: fx.ctx.tenantId } });
    const lines = [{ description: "Synthetic fiscal adjustment", quantity: "1", unitPrice: "50", taxRate: "21",
      wbsNodeId: po.lines[0]!.wbsNodeId }];
    const credit = await createSupplierCreditNoteFromInvoice({ parentSupplierInvoiceId: fx.invoiceId, lines }, fx.ctx);
    await issueSupplierCreditNote(credit.id, fx.ctx, po.projectId);
    const credited = await prisma.payable.findUniqueOrThrow({ where: { id: fx.payableId } });
    assert.equal(credited.paidAmount.toFixed(2), "121.00");
    assert.equal(credited.creditedAmount.toFixed(2), "60.50");
    assert.equal(await prisma.payable.count({ where: { supplierInvoiceId: credit.id } }), 0);
    const debit = await createSupplierDebitNoteFromInvoice({ parentSupplierInvoiceId: fx.invoiceId,
      lines: [{ ...lines[0]!, unitPrice: "10" }] }, fx.ctx);
    await issueSupplierDebitNote(debit.id, fx.ctx, po.projectId);
    const debt = await prisma.payable.findUniqueOrThrow({ where: { supplierInvoiceId: debit.id } });
    assert.equal(debt.originalAmount.toFixed(2), "12.10");
    assert.equal(await prisma.accountMovement.count({ where: { tenantId: fx.ctx.tenantId } }), movements);
    assert.deepEqual(await getPurchaseOrderBillingSummary(po.id, fx.ctx), before);
    const accruedAfter = await getProjectAccruedTotal(po.projectId, {}, fx.ctx);
    assert.equal(accruedAfter.minus(accruedBefore).toFixed(2), "-48.40");
    await cancelSupplierCreditNote(credit.id, fx.ctx, po.projectId);
    assert.equal((await prisma.payable.findUniqueOrThrow({ where: { id: fx.payableId } })).creditedAmount.toFixed(2), "0.00");
    assert.equal((await getProjectAccruedTotal(po.projectId, {}, fx.ctx)).minus(accruedBefore).toFixed(2), "12.10");
  });
});
