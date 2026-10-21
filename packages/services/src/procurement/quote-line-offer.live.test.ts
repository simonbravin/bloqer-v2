import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { prisma } from "@bloqer/database";
import type { QuoteLineOfferKind } from "@bloqer/domain";

import { createProcurementRegressionFixtures } from "./fixtures/procurement-regression";
import { createProcurementQuote, deleteProcurementQuote, updateProcurementQuote } from "./procurement-quote.service";
import {
  assertPoLinesWithinSelectedQuote, createPurchaseOrderFromQuoteLines,
  createPurchaseOrdersFromAwards, selectProcurementQuoteAndCreatePo,
} from "./purchase-request-to-po.service";
import { cancelPurchaseOrder } from "./purchase-order.service";
import { ServiceError } from "../types";

describe("D-118 quote coverage and historical preservation (isolated database)", {
  skip: process.env.BLOQER_PROCUREMENT_LIVE_DB !== "1", concurrency: false,
}, () => {
  let fx: Awaited<ReturnType<typeof createProcurementRegressionFixtures>>;
  let secondQuoteId: string;
  let giftPoId: string;
  const savedQuote = (id: string) => prisma.procurementQuote.findUniqueOrThrow({
    where: { id }, include: { lines: { orderBy: { sortOrder: "asc" } } },
  });
  function lines(secondKind: QuoteLineOfferKind | null | undefined, secondPrice = "0") {
    return fx.lineIds.map((purchaseRequestLineId, sortOrder) => ({
      purchaseRequestLineId, sortOrder, unitPrice: sortOrder === 0 ? "100" : secondPrice,
      taxRate: "21", discountPct: "0", offerKind: sortOrder === 0 ? undefined : secondKind,
    }));
  }
  async function edit(secondKind: QuoteLineOfferKind | null | undefined, secondPrice = "0") {
    return updateProcurementQuote(fx.quoteId, fx.requestId, {
      currency: "ARS", iibbPerceptionRate: "0", lines: lines(secondKind, secondPrice),
    }, fx.ctx);
  }
  before(async () => {
    fx = await createProcurementRegressionFixtures(prisma);
    secondQuoteId = fx.secondQuoteId;
  });
  after(async () => { await prisma.$disconnect(); });

  it("leaves legacy classification null and rejects unclassified zero in single and batch awards", async () => {
    assert.ok((await savedQuote(fx.quoteId)).lines.every(line => line.offerKind === null));
    await edit(undefined);
    const original = await savedQuote(fx.quoteId);
    assert.equal(original.lines[1]!.offerKind, null);
    assert.equal(original.lines[1]!.lineTotal.toString(), "0");
    await assert.rejects(() => createPurchaseOrderFromQuoteLines(fx.quoteId, [fx.lineIds[1]!], fx.ctx), /sin clasificar/);
    await assert.rejects(() => createPurchaseOrdersFromAwards(fx.requestId, [
      { procurementQuoteId: fx.quoteId, purchaseRequestLineIds: [fx.lineIds[1]!] },
    ], fx.ctx), /sin clasificar/);
    assert.deepEqual(await savedQuote(fx.quoteId), original);
    assert.equal(await prisma.purchaseOrder.count({ where: { purchaseRequestId: fx.requestId } }), 0);
  });

  it("validates new lines and positive document total atomically, then creates explicit quoted lines", async () => {
    const second = await savedQuote(secondQuoteId);
    await deleteProcurementQuote(second.id, fx.requestId, fx.ctx);
    const input = {
      purchaseRequestId: fx.requestId, supplierContactId: second.supplierContactId,
      currency: "ARS", iibbPerceptionRate: "0",
      lines: lines("QUOTED", "100").map(line => ({ ...line, offerKind: "QUOTED" as const })),
    };
    await assert.rejects(() => createProcurementQuote({ ...input, lines: lines("NOT_QUOTED", "5") }, fx.ctx), /importe cero/);
    await assert.rejects(() => createProcurementQuote({ ...input, lines: input.lines.map(line => ({
      ...line, offerKind: "BONIFIED", discountPct: "100",
    })) }, fx.ctx), /total de la cotización/);
    await assert.rejects(() => createProcurementQuote({ ...input, lines: lines(undefined) }, fx.ctx), /total positivo/);
    assert.equal(await prisma.procurementQuote.count({ where: { purchaseRequestId: fx.requestId } }), 1);
    secondQuoteId = (await createProcurementQuote(input, fx.ctx)).id;
    assert.ok((await savedQuote(secondQuoteId)).lines.every(line => line.offerKind === "QUOTED"));
    await assert.rejects(() => updateProcurementQuote(secondQuoteId, fx.requestId, {
      currency: "ARS",
      lines: input.lines.map(line => ({ ...line, offerKind: null })),
    }, fx.ctx), /quitar la clasificación/);
  });

  it("excludes not quoted lines from each item minimum and rolls back an earlier valid award", async () => {
    await edit("NOT_QUOTED");
    await prisma.companyProcurementSettings.update({ where: { companyId: fx.ctx.companyId! }, data: { minQuotesRequired: 2 } });
    await assert.rejects(() => createPurchaseOrderFromQuoteLines(fx.quoteId, [fx.lineIds[1]!], fx.ctx), /no fue cotizado/);
    await assert.rejects(() => createPurchaseOrderFromQuoteLines(secondQuoteId, [fx.lineIds[1]!], fx.ctx), /hay 1/);
    await assert.rejects(() => createPurchaseOrdersFromAwards(fx.requestId, [
      { procurementQuoteId: fx.quoteId, purchaseRequestLineIds: [fx.lineIds[0]!] },
      { procurementQuoteId: secondQuoteId, purchaseRequestLineIds: [fx.lineIds[1]!] },
    ], fx.ctx), /hay 1/);
    assert.equal(await prisma.purchaseOrder.count({ where: { purchaseRequestId: fx.requestId } }), 0);
    assert.equal(await prisma.purchaseRequestLine.count({ where: { purchaseRequestId: fx.requestId, awardedPurchaseOrderId: { not: null } } }), 0);
  });

  it("counts explicit gifts, excludes them from shortcut, and preserves monetary components", async () => {
    await edit("NOT_QUOTED");
    const before = await savedQuote(fx.quoteId);
    await edit("BONIFIED");
    const after = await savedQuote(fx.quoteId);
    assert.equal(after.totalAmount.toString(), before.totalAmount.toString());
    assert.deepEqual(after.lines.map(l => [l.lineSubtotal.toString(), l.lineTax.toString(), l.lineTotal.toString()]),
      before.lines.map(l => [l.lineSubtotal.toString(), l.lineTax.toString(), l.lineTotal.toString()]));
    await assert.rejects(() => createPurchaseOrderFromQuoteLines(fx.quoteId, [fx.lineIds[1]!], fx.ctx,
      { positiveQuotedOnly: true }), /bonificados se seleccionan/);
    const shortcut = await selectProcurementQuoteAndCreatePo(fx.quoteId, fx.ctx);
    const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: shortcut.purchaseOrderId }, include: { lines: true } });
    assert.deepEqual(po.lines.map(line => line.purchaseRequestLineId), [fx.lineIds[0]]);
    await assert.rejects(() => edit("NOT_QUOTED"), /activa|estado/);
    const result = await createPurchaseOrdersFromAwards(fx.requestId, [
      { procurementQuoteId: fx.quoteId, purchaseRequestLineIds: [fx.lineIds[1]!] },
    ], fx.ctx);
    giftPoId = result.purchaseOrderIds[0]!;
    assert.equal((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: giftPoId } })).totalAmount.toString(), "0");
  });

  it("keeps existing legacy zero awards usable; cancellation and re-award applies the new rule", async () => {
    // Model an already processed legacy zero; fixture-only mutation, never customer data.
    await prisma.procurementQuoteLine.updateMany({ where: {
      procurementQuoteId: fx.quoteId, purchaseRequestLineId: fx.lineIds[1],
    }, data: { offerKind: null } });
    const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: giftPoId }, include: { lines: true } });
    await assertPoLinesWithinSelectedQuote(po.id, po.lines, fx.ctx.tenantId);
    assert.deepEqual(await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: po.id }, include: { lines: true } }), po);
    await cancelPurchaseOrder(giftPoId, fx.ctx);
    await assert.rejects(() => createPurchaseOrderFromQuoteLines(fx.quoteId, [fx.lineIds[1]!], fx.ctx), /sin clasificar/);
    await assert.rejects(() => edit("BONIFIED"),
      (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT");
  });

  it("serializes classification edits against adjudication without changing an awarded offer", async () => {
    const concurrent = await createProcurementRegressionFixtures(prisma);
    const results = await Promise.allSettled([
      updateProcurementQuote(concurrent.quoteId, concurrent.requestId, {
        currency: "ARS", iibbPerceptionRate: "0",
        lines: concurrent.lineIds.map((purchaseRequestLineId, sortOrder) => ({
          purchaseRequestLineId, sortOrder, unitPrice: sortOrder === 0 ? "100" : "0",
          taxRate: "21", discountPct: "0", offerKind: sortOrder === 0 ? "QUOTED" : "NOT_QUOTED",
        })),
      }, concurrent.ctx),
      createPurchaseOrderFromQuoteLines(concurrent.quoteId, [concurrent.lineIds[1]!], concurrent.ctx),
    ]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    const rejected = results.find(result => result.status === "rejected");
    assert.ok(rejected?.status === "rejected" && rejected.reason instanceof ServiceError);
    assert.equal(rejected.reason.code, "CONFLICT");
    const selected = await prisma.purchaseRequestLine.findUniqueOrThrow({ where: { id: concurrent.lineIds[1] } });
    const quote = await savedQuote(concurrent.quoteId);
    if (selected.awardedPurchaseOrderId) {
      assert.equal(quote.lines[1]!.offerKind, null);
      assert.ok(quote.lines[1]!.lineTotal.greaterThan(0));
    } else {
      assert.equal(quote.lines[1]!.offerKind, "NOT_QUOTED");
    }
  });
});
