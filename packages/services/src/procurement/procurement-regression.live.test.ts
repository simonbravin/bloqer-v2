import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { prisma } from "@bloqer/database";

import {
  createSupplierInvoiceDraftFromPurchaseOrder,
  getPurchaseOrderBillingSummary,
} from "../ap/supplier-invoice-from-po.service";
import { cancelSupplierInvoice, updateSupplierInvoice } from "../ap/supplier-invoice.service";
import { updateProcurementQuote } from "./procurement-quote.service";
import { cancelPurchaseOrder } from "./purchase-order.service";
import { ServiceError } from "../types";
import { createProcurementRegressionFixtures } from "./fixtures/procurement-regression";
import { createPurchaseOrdersFromAwards } from "./purchase-request-to-po.service";

// Explicit database selection is enforced by the fixture before any seed/mutation.
describe(
  "procurement regression baseline (isolated database)",
  {
    skip: process.env.BLOQER_PROCUREMENT_LIVE_DB !== "1",
    concurrency: false,
  },
  () => {
    let fx: Awaited<ReturnType<typeof createProcurementRegressionFixtures>>;
    before(async () => {
      fx = await createProcurementRegressionFixtures(prisma);
    });
    after(async () => {
      await prisma.$disconnect();
    });

    it("keeps received, invoiced and paid amounts separate for partial operations", async () => {
      const summary = await getPurchaseOrderBillingSummary(fx.poId, fx.ctx);
      assert.equal(summary.receivedAmount, "605.00");
      assert.equal(summary.invoicedAmount, "242.00");
      assert.equal(summary.paidAmount, "121.00");
      assert.equal(summary.pendingToInvoice, "363.00");
    });

    it("does not expose a purchase order billing summary to another tenant", async () => {
      await assert.rejects(
        () => getPurchaseOrderBillingSummary(fx.poId, fx.otherTenantCtx),
        (error: unknown) =>
          error instanceof ServiceError && ["FORBIDDEN", "NOT_FOUND"].includes(error.code),
      );
    });

    it("refuses an award from a viewer", async () => {
      await assert.rejects(
        () =>
          createPurchaseOrdersFromAwards(
            fx.requestId,
            [
              {
                procurementQuoteId: fx.quoteId,
                purchaseRequestLineIds: [fx.lineIds[0]!],
              },
            ],
            fx.viewerCtx,
          ),
        (error: unknown) => error instanceof ServiceError && error.code === "FORBIDDEN",
      );
    });

    it("preserves AP line amounts on unchanged edits and rejects a foreign line ID", async () => {
      const invoice = await prisma.supplierInvoice.findUniqueOrThrow({
        where: { id: fx.moneyInvoiceId },
        include: { lines: true },
      });
      const original = invoice.lines[0]!;
      const line = {
        id: original.id,
        description: "Only description changed",
        quantity: "333",
        unitPrice: "8.2645",
        taxRate: "21",
        discountPct: "0",
        sortOrder: 0,
      };
      const saved = await updateSupplierInvoice(invoice.id, { lines: [line] }, fx.ctx);
      assert.equal(saved.totalAmount, "3330.00");
      assert.equal(saved.lines[0]!.lineTax, "577.93");
      await assert.rejects(
        () => updateSupplierInvoice(invoice.id, { lines: [{ ...line, id: randomUUID() }] }, fx.ctx),
        (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT",
      );
      const changed = await updateSupplierInvoice(
        invoice.id,
        { lines: [{ ...line, id: saved.lines[0]!.id, unitPrice: "9" }] },
        fx.ctx,
      );
      assert.equal(changed.totalAmount, "3626.37");
    });

    it("preserves quote gross totals on net re-save, but recalculates changed prices", async () => {
      await updateProcurementQuote(
        fx.quoteId,
        fx.requestId,
        {
          currency: "ARS",
          pricesIncludeTax: true,
          iibbPerceptionRate: "0",
          lines: fx.lineIds.map((purchaseRequestLineId, sortOrder) => ({
            purchaseRequestLineId,
            unitPrice: "1",
            taxRate: "21",
            discountPct: "0",
            sortOrder,
          })),
        },
        fx.ctx,
      );
      const gross = await prisma.procurementQuote.findUniqueOrThrow({
        where: { id: fx.quoteId },
        include: { lines: true },
      });
      assert.equal(gross.totalAmount.toFixed(2), "20.00");
      await updateProcurementQuote(
        fx.quoteId,
        fx.requestId,
        {
          currency: "ARS",
          notes: "Only notes change",
          pricesIncludeTax: false,
          lines: gross.lines.map((line) => ({
            purchaseRequestLineId: line.purchaseRequestLineId,
            unitPrice: line.unitPrice.toString(),
            taxRate: line.taxRate.toString(),
            discountPct: line.discountPct.toString(),
            sortOrder: line.sortOrder,
          })),
        },
        fx.ctx,
      );
      assert.equal(
        (
          await prisma.procurementQuote.findUniqueOrThrow({ where: { id: fx.quoteId } })
        ).totalAmount.toFixed(2),
        "20.00",
      );
      await updateProcurementQuote(
        fx.quoteId,
        fx.requestId,
        {
          currency: "ARS",
          pricesIncludeTax: false,
          lines: fx.lineIds.map((purchaseRequestLineId, sortOrder) => ({
            purchaseRequestLineId,
            unitPrice: "100",
            taxRate: "21",
            discountPct: "0",
            sortOrder,
          })),
        },
        fx.ctx,
      );
      assert.equal(
        (
          await prisma.procurementQuote.findUniqueOrThrow({ where: { id: fx.quoteId } })
        ).totalAmount.toFixed(2),
        "2420.00",
      );
    });

    it("rejects another tenant's award", async () => {
      await assert.rejects(
        () =>
          createPurchaseOrdersFromAwards(
            fx.requestId,
            [{ procurementQuoteId: fx.quoteId, purchaseRequestLineIds: [fx.lineIds[0]!] }],
            fx.otherTenantCtx,
          ),
        (error: unknown) =>
          error instanceof ServiceError && ["FORBIDDEN", "NOT_FOUND"].includes(error.code),
      );
    });

    it("rolls back the first order if a later supplier group is invalid", async () => {
      await assert.rejects(
        () =>
          createPurchaseOrdersFromAwards(
            fx.requestId,
            [
              { procurementQuoteId: fx.quoteId, purchaseRequestLineIds: [fx.lineIds[0]!] },
              { procurementQuoteId: randomUUID(), purchaseRequestLineIds: [fx.lineIds[1]!] },
            ],
            fx.ctx,
          ),
        (error: unknown) => error instanceof ServiceError && error.code === "NOT_FOUND",
      );
      assert.equal(
        await prisma.purchaseOrder.count({ where: { purchaseRequestId: fx.requestId } }),
        0,
      );
      assert.equal(
        await prisma.purchaseRequestLine.count({
          where: { purchaseRequestId: fx.requestId, awardedPurchaseOrderId: { not: null } },
        }),
        0,
      );
    });

    it("awards one complete line and leaves the other line available", async () => {
      const result = await createPurchaseOrdersFromAwards(
        fx.requestId,
        [
          {
            procurementQuoteId: fx.quoteId,
            purchaseRequestLineIds: [fx.lineIds[0]!],
          },
        ],
        fx.ctx,
      );
      assert.equal(result.purchaseOrderIds.length, 1);
      const request = await prisma.purchaseRequest.findUniqueOrThrow({
        where: { id: fx.requestId },
        include: { lines: { orderBy: { sortOrder: "asc" } } },
      });
      assert.equal(request.status, "SUBMITTED");
      assert.equal(request.lines[0]!.awardedPurchaseOrderId, result.purchaseOrderIds[0]);
      assert.equal(request.lines[1]!.awardedPurchaseOrderId, null);
      const lines = await prisma.purchaseOrderLine.findMany({
        where: { purchaseOrderId: result.purchaseOrderIds[0] },
      });
      assert.equal(lines.length, 1);
      assert.equal(lines[0]!.purchaseRequestLineId, fx.lineIds[0]);
      assert.equal(lines[0]!.quantity.toFixed(4), "10.0000");
    });
    it("serializes concurrent attempts so a line is awarded only once", async () => {
      const award = () =>
        createPurchaseOrdersFromAwards(
          fx.requestId,
          [{ procurementQuoteId: fx.quoteId, purchaseRequestLineIds: [fx.lineIds[1]!] }],
          fx.ctx,
        );
      const outcomes = await Promise.allSettled([award(), award()]);
      assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
      const rejected = outcomes.find((r) => r.status === "rejected") as PromiseRejectedResult;
      assert.ok(rejected.reason instanceof ServiceError && rejected.reason.code === "CONFLICT");
      assert.equal(
        await prisma.purchaseOrderLine.count({
          where: { purchaseRequestLineId: fx.lineIds[1], isActiveAward: true },
        }),
        1,
      );
      assert.equal(
        (await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: fx.requestId } })).status,
        "QUOTE_SELECTED",
      );
    });

    it("cancels an award and re-awards the freed line to the other supplier", async () => {
      const line = await prisma.purchaseRequestLine.findUniqueOrThrow({
        where: { id: fx.lineIds[0] },
      });
      const oldPoId = line.awardedPurchaseOrderId!;
      await cancelPurchaseOrder(oldPoId, fx.ctx);
      const oldLines = await prisma.purchaseOrderLine.findMany({
        where: { purchaseOrderId: oldPoId },
      });
      assert.ok(oldLines.every((l) => !l.isActiveAward && l.procurementQuoteLineId === null));
      assert.equal(
        (await prisma.purchaseRequestLine.findUniqueOrThrow({ where: { id: line.id } }))
          .awardedPurchaseOrderId,
        null,
      );
      assert.equal(
        (await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: fx.requestId } })).status,
        "SUBMITTED",
      );
      const awarded = await createPurchaseOrdersFromAwards(
        fx.requestId,
        [{ procurementQuoteId: fx.secondQuoteId, purchaseRequestLineIds: [line.id] }],
        fx.ctx,
      );
      const newPo = await prisma.purchaseOrder.findUniqueOrThrow({
        where: { id: awarded.purchaseOrderIds[0] },
      });
      assert.equal(newPo.selectedProcurementQuoteId, fx.secondQuoteId);
      assert.equal(newPo.subtotal.toFixed(2), "1000.00");
      assert.equal(newPo.taxAmount.toFixed(2), "210.00");
      assert.equal(newPo.totalAmount.toFixed(2), "1210.00");
      assert.equal(
        (await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: fx.requestId } })).status,
        "QUOTE_SELECTED",
      );
    });
    it("awards two supplier groups atomically after cancelling their previous awards", async () => {
      const orders = await prisma.purchaseOrder.findMany({
        where: { purchaseRequestId: fx.requestId, status: { not: "CANCELLED" } },
      });
      for (const order of orders) await cancelPurchaseOrder(order.id, fx.ctx);
      const result = await createPurchaseOrdersFromAwards(
        fx.requestId,
        [
          { procurementQuoteId: fx.quoteId, purchaseRequestLineIds: [fx.lineIds[0]!] },
          { procurementQuoteId: fx.secondQuoteId, purchaseRequestLineIds: [fx.lineIds[1]!] },
        ],
        fx.ctx,
      );
      assert.equal(result.purchaseOrderIds.length, 2);
      const quotes = await prisma.procurementQuote.findMany({
        where: { id: { in: [fx.quoteId, fx.secondQuoteId] } },
      });
      assert.ok(quotes.every((quote) => quote.status === "SELECTED"));
      assert.equal(
        await prisma.purchaseOrderLine.count({
          where: { purchaseRequestLineId: { in: fx.lineIds }, isActiveAward: true },
        }),
        2,
      );
    });
    it("reuses one AP draft for simultaneous PO-panel and receipt triggers", async () => {
      const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: fx.poId } });
      const input = {
        purchaseOrderId: fx.poId,
        projectId: po.projectId,
        basis: "remaining" as const,
      };
      const results = await Promise.all([
        createSupplierInvoiceDraftFromPurchaseOrder(input, fx.ctx),
        createSupplierInvoiceDraftFromPurchaseOrder(
          { ...input, purchaseReceiptId: fx.receiptId },
          fx.ctx,
          { asSystemFromReceiptPolicy: true },
        ),
      ]);
      assert.equal(results[0].id, results[1].id);
      assert.equal(
        await prisma.supplierInvoice.count({
          where: { purchaseOrderId: fx.poId, status: "DRAFT" },
        }),
        1,
      );
      const summary = await getPurchaseOrderBillingSummary(fx.poId, fx.ctx);
      assert.equal(summary.pendingToInvoice, "0.00");
      assert.equal(summary.draftReservedAmount, "363.00");
    });
    it("refreshes the same draft for a later partial receipt and ignores cancelled drafts", async () => {
      const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: fx.poId }, include: { lines: true } });
      const input = { purchaseOrderId: fx.poId, projectId: po.projectId, basis: "remaining" as const };
      const before = await createSupplierInvoiceDraftFromPurchaseOrder(input, fx.ctx);
      // Extend the synthetic scenario with a second confirmed receipt of 2 units.
      const receipt = await prisma.$transaction(async (tx) => {
        await tx.purchaseOrderLine.update({ where: { id: po.lines[0]!.id }, data: { receivedQuantity: "7" } });
        return tx.purchaseReceipt.create({ data: {
          tenantId: po.tenantId, companyId: po.companyId, projectId: po.projectId, supplierContactId: po.supplierContactId,
          purchaseOrderId: po.id, receiptDate: new Date(), status: "CONFIRMED", createdBy: fx.ctx.actorUserId,
          lines: { create: { purchaseOrderLineId: po.lines[0]!.id, quantityReceived: "2" } },
        } });
      });
      const refreshed = await createSupplierInvoiceDraftFromPurchaseOrder({ ...input, purchaseReceiptId: receipt.id }, fx.ctx);
      assert.equal(refreshed.id, before.id);
      assert.equal(refreshed.lines[0]!.quantity, "5.0000");
      assert.equal(refreshed.lines[0]!.purchaseOrderLineId, po.lines[0]!.id);
      await cancelSupplierInvoice(refreshed.id, fx.ctx, po.projectId);
      const replacement = await createSupplierInvoiceDraftFromPurchaseOrder(input, fx.ctx);
      assert.notEqual(replacement.id, refreshed.id);
      assert.equal(replacement.lines[0]!.quantity, "5.0000");
      const summary = await getPurchaseOrderBillingSummary(fx.poId, fx.ctx);
      assert.equal(summary.receivedAmount, "847.00");
      assert.equal(summary.invoicedAmount, "242.00");
      assert.equal(summary.draftReservedAmount, "605.00");
      assert.equal(summary.pendingToInvoice, "0.00");
      assert.equal(summary.paidAmount, "121.00");
    });
  },
);
