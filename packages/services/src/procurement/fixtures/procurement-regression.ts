import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@bloqer/database";

import { AI_ADV } from "../../ai/fixtures/adversarial-ids";
import { seedAiAdversarialFixtures } from "../../ai/fixtures/seed-adversarial-tenants";
import type { ServiceContext } from "../../types";

/** Explicit opt-in to a disposable database, never the normal dev or production DB. */
export function assertProcurementFixtureDatabase(): string {
  const expected = process.env.BLOQER_PROCUREMENT_TEST_DATABASE;
  assert.ok(expected, "An isolated procurement database name is required");
  assert.ok(
    expected.startsWith("bloqer_indari_phase0_") || expected.startsWith("bloqer_procurement_test_"),
    "An explicitly named isolated procurement database is required",
  );
  const urls = [process.env.DATABASE_URL, process.env.DIRECT_URL];
  for (const value of urls) {
    assert.ok(value, "Both database URLs must be explicit; no .env fallback");
    const url = new URL(value);
    assert.equal(
      url.hostname,
      "ep-curly-math-aptjniho.c-7.us-east-1.aws.neon.tech",
      "Fixtures are restricted to the verified development compute",
    );
    assert.equal(
      decodeURIComponent(url.pathname.slice(1)),
      expected,
      "Fixture database must match the explicitly selected isolated database",
    );
  }
  return expected;
}

/** Reusable synthetic scenarios; no customer documents, real addresses or external calls. */
export async function createProcurementRegressionFixtures(db: PrismaClient) {
  const expected = assertProcurementFixtureDatabase();
  const identity = await db.$queryRaw<
    Array<{ database: string }>
  >`SELECT current_database() AS database`;
  assert.equal(identity[0]?.database, expected);
  const base = await seedAiAdversarialFixtures(db);
  const a = AI_ADV.tenantA;
  const ctx: ServiceContext = {
    tenantId: base.tenantAId,
    companyId: a.companyId,
    actorUserId: base.ownerAUserId,
    roles: ["OWNER"],
  };
  const today = new Date();
  const future = new Date(today);
  future.setUTCDate(future.getUTCDate() + 30);

  const scenario = await db.$transaction(
    async (tx) => {
      await tx.companyProcurementSettings.upsert({
        where: { companyId: a.companyId },
        update: { minQuotesRequired: 1, apPaymentNotificationChannel: "IN_APP" },
        create: {
          companyId: a.companyId,
          minQuotesRequired: 1,
          apPaymentNotificationChannel: "IN_APP",
        },
      });
      const scope = {
        tenantId: base.tenantAId,
        companyId: a.companyId,
        projectId: base.projectA1Id,
      };
      const numberScope = { tenantId: scope.tenantId, companyId: scope.companyId };
      const maxPr = await tx.purchaseRequest.aggregate({
        where: numberScope,
        _max: { number: true },
      });
      const request = await tx.purchaseRequest.create({
        data: {
          ...scope,
          number: (maxPr._max.number ?? 0) + 1,
          status: "SUBMITTED",
          requestedByUserId: base.ownerAUserId,
          createdBy: base.ownerAUserId,
          submittedAt: today,
          notes: "Synthetic procurement regression: two whole lines",
          lines: {
            create: [0, 1].map((sortOrder) => ({
              wbsNodeId: a.wbsItemId,
              description: `Synthetic material ${sortOrder + 1}`,
              unit: "un",
              quantity: "10",
              lineType: "MATERIAL",
              costType: "MATERIAL",
              sortOrder,
              budgetUnitCostSnapshot: "100",
              budgetQuantitySnapshot: "10",
            })),
          },
        },
        include: { lines: { orderBy: { sortOrder: "asc" } } },
      });
      const quote = await tx.procurementQuote.create({
        data: {
          tenantId: base.tenantAId,
          purchaseRequestId: request.id,
          supplierContactId: a.supplierContactId,
          status: "RECEIVED",
          validUntil: future,
          receivedAt: today,
          leadTimeDays: 1,
          iibbPerceptionRate: "0",
          subtotal: "2000",
          taxAmount: "420",
          totalAmount: "2420",
          totalAmountArs: "2420",
          lines: {
            create: request.lines.map((line, sortOrder) => ({
              purchaseRequestLineId: line.id,
              unitPrice: "100",
              taxRate: "21",
              lineSubtotal: "1000",
              lineTax: "210",
              lineTotal: "1210",
              sortOrder,
            })),
          },
        },
      });

      const secondSupplier = await tx.contact.create({
        data: {
          tenantId: base.tenantAId,
          legalName: "Synthetic second supplier",
          roles: { create: { tenantId: base.tenantAId, role: "SUPPLIER" } },
        },
      });
      const secondQuote = await tx.procurementQuote.create({
        data: {
          tenantId: base.tenantAId,
          purchaseRequestId: request.id,
          supplierContactId: secondSupplier.id,
          status: "RECEIVED",
          validUntil: future,
          iibbPerceptionRate: "0",
          subtotal: "2000",
          taxAmount: "420",
          totalAmount: "2420",
          totalAmountArs: "2420",
          lines: {
            create: request.lines.map((line, sortOrder) => ({
              purchaseRequestLineId: line.id,
              unitPrice: "100",
              taxRate: "21",
              lineSubtotal: "1000",
              lineTax: "210",
              lineTotal: "1210",
              sortOrder,
            })),
          },
        },
      });

      const maxPo = await tx.purchaseOrder.aggregate({
        where: numberScope,
        _max: { number: true },
      });
      const po = await tx.purchaseOrder.create({
        data: {
          ...scope,
          supplierContactId: a.supplierContactId,
          number: (maxPo._max.number ?? 0) + 1,
          issueDate: today,
          status: "PARTIALLY_RECEIVED",
          currency: "ARS",
          subtotal: "1000",
          taxAmount: "210",
          totalAmount: "1210",
          totalAmountArs: "1210",
          createdBy: base.ownerAUserId,
          lines: {
            create: {
              description: "Synthetic partial receipt",
              unit: "un",
              quantity: "10",
              receivedQuantity: "5",
              wbsNodeId: a.wbsItemId,
              costType: "MATERIAL",
              unitPrice: "100",
              taxRate: "21",
              lineSubtotal: "1000",
              lineTax: "210",
              lineTotal: "1210",
            },
          },
        },
        include: { lines: true },
      });
      const poLineId = po.lines[0]!.id;
      const receipt = await tx.purchaseReceipt.create({
        data: {
          ...scope,
          supplierContactId: a.supplierContactId,
          purchaseOrderId: po.id,
          receiptDate: today,
          status: "CONFIRMED",
          createdBy: base.ownerAUserId,
          lines: { create: { purchaseOrderLineId: poLineId, quantityReceived: "5" } },
        },
      });
      const maxInvoice = await tx.supplierInvoice.aggregate({
        where: { ...numberScope, documentKind: "INVOICE" },
        _max: { number: true },
      });
      const invoice = await tx.supplierInvoice.create({
        data: {
          ...scope,
          supplierContactId: a.supplierContactId,
          purchaseOrderId: po.id,
          number: (maxInvoice._max.number ?? 0) + 1,
          issueDate: today,
          dueDate: future,
          status: "ISSUED",
          subtotal: "200",
          taxAmount: "42",
          totalAmount: "242",
          amountArs: "242",
          createdBy: base.ownerAUserId,
          lines: {
            create: {
              purchaseOrderLineId: poLineId,
              wbsNodeId: a.wbsItemId,
              costType: "MATERIAL",
              description: "Synthetic partial invoice",
              quantity: "2",
              unitPrice: "100",
              taxRate: "21",
              lineSubtotal: "200",
              lineTax: "42",
              lineTotal: "242",
            },
          },
        },
      });
      const moneyInvoice = await tx.supplierInvoice.create({
        data: {
          tenantId: scope.tenantId,
          companyId: scope.companyId,
          projectId: null,
          supplierContactId: a.supplierContactId,
          number: (maxInvoice._max.number ?? 0) + 2,
          issueDate: today,
          dueDate: future,
          status: "DRAFT",
          invoiceLetter: "B",
          iibbPerceptionRate: "0",
          subtotal: "2752.07",
          taxAmount: "577.93",
          totalAmount: "3330",
          amountArs: "3330",
          createdBy: base.ownerAUserId,
          lines: {
            create: {
              description: "Synthetic gross-inclusive invoice",
              quantity: "333",
              unitPrice: "8.2645",
              taxRate: "21",
              lineSubtotal: "2752.07",
              lineTax: "577.93",
              lineTotal: "3330",
            },
          },
        },
      });
      const payable = await tx.payable.create({
        data: {
          ...scope,
          supplierContactId: a.supplierContactId,
          supplierInvoiceId: invoice.id,
          issueDate: today,
          dueDate: future,
          currency: "ARS",
          originalAmount: "242",
          paidAmount: "121",
          status: "PARTIAL",
        },
      });
      const account = await tx.treasuryAccount.create({
        data: {
          tenantId: scope.tenantId,
          companyId: scope.companyId,
          name: `Synthetic procurement ${randomUUID()}`,
          type: "BANK",
          currency: "ARS",
          openingBalance: "1000",
        },
      });
      const payment = await tx.payment.create({
        data: {
          ...scope,
          supplierContactId: a.supplierContactId,
          supplierInvoiceId: invoice.id,
          payableId: payable.id,
          accountId: account.id,
          paymentDate: today,
          currency: "ARS",
          amount: "121",
          amountArs: "121",
          status: "CONFIRMED",
          createdBy: base.ownerAUserId,
        },
      });
      await tx.accountMovement.create({
        data: {
          tenantId: scope.tenantId,
          companyId: scope.companyId,
          accountId: account.id,
          movementDate: today,
          type: "OUTFLOW",
          sourceType: "PAYMENT",
          sourceId: payment.id,
          currency: "ARS",
          amount: "121",
          description: "Synthetic partial payment",
        },
      });
      return {
        requestId: request.id,
        lineIds: request.lines.map((line) => line.id),
        quoteId: quote.id,
        secondQuoteId: secondQuote.id,
        poId: po.id,
        receiptId: receipt.id,
        invoiceId: invoice.id,
        moneyInvoiceId: moneyInvoice.id,
        payableId: payable.id,
        paymentId: payment.id,
      };
    },
    { timeout: 60000 },
  );
  return {
    ...scenario,
    ctx,
    otherTenantCtx: {
      tenantId: base.tenantBId,
      companyId: AI_ADV.tenantB.companyId,
      actorUserId: base.ownerBUserId,
      roles: ["OWNER"],
    } satisfies ServiceContext,
    viewerCtx: {
      ...ctx,
      actorUserId: base.viewerAUserId,
      roles: ["PROJECT_VIEWER"],
    } satisfies ServiceContext,
  };
}
