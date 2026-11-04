import assert from "node:assert/strict";
import { test } from "node:test";

import { Prisma } from "@bloqer/database";

import {
  assertPaidInvoicePoReconciliation,
  reconcilePaidSupplierInvoicesWithPurchaseOrders,
} from "./supplier-invoice-po-reconciliation.service";
import { ServiceError } from "../types";

const scope = { tenantId: "tenant", companyId: "company", projectId: "project" };
const pair = {
  invoiceId: "invoice",
  invoiceLineId: "invoice-line",
  purchaseOrderId: "order",
  purchaseOrderLineId: "order-line",
  expectedInvoiceUpdatedAt: "2026-10-29T00:00:00.000Z",
  expectedOrderUpdatedAt: "2026-10-29T00:00:00.000Z",
};
const money = (value: string) => new Prisma.Decimal(value);
function records() {
  const invoice: Parameters<typeof assertPaidInvoicePoReconciliation>[0] = {
    ...scope,
    supplierContactId: "supplier",
    status: "ISSUED",
    documentKind: "INVOICE",
    currency: "ARS",
    totalAmount: money("1500000"),
    purchaseOrderId: null,
    subcontractCertificationId: null,
    lines: [
      {
        id: "invoice-line",
        quantity: money("1"),
        purchaseOrderLineId: null,
        costAnalysisLineId: null,
      },
    ],
    payable: { status: "PAID", paidAmount: money("1500000"), creditedAmount: money("0") },
  };
  const order: Parameters<typeof assertPaidInvoicePoReconciliation>[1] = {
    ...scope,
    supplierContactId: "supplier",
    status: "RECEIVED",
    currency: "ARS",
    totalAmount: money("1500000"),
    lines: [
      { id: "order-line", quantity: money("1"), receivedQuantity: money("1"), wbsNodeId: "wbs" },
    ],
    supplierInvoices: [],
  };
  return { invoice, order };
}
const conflict = (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT";

test("accepts an explicit paid/received pair without changing the invoice's fiscal amounts", () => {
  const { invoice, order } = records();
  const before = JSON.stringify({ invoice, order });
  assert.doesNotThrow(() => assertPaidInvoicePoReconciliation(invoice, order, pair, scope));
  assert.equal(JSON.stringify({ invoice, order }), before);
});

test("rejects cross-tenant, company and project documents", () => {
  for (const key of ["tenantId", "companyId", "projectId"] as const) {
    const { invoice, order } = records();
    order[key] = "other";
    assert.throws(
      () => assertPaidInvoicePoReconciliation(invoice, order, pair, scope),
      (error: unknown) => error instanceof ServiceError && error.code === "FORBIDDEN",
    );
  }
});

test("rejects matching totals for a different supplier or currency", () => {
  for (const key of ["supplierContactId", "currency"] as const) {
    const { invoice, order } = records();
    order[key] = "other";
    assert.throws(() => assertPaidInvoicePoReconciliation(invoice, order, pair, scope), conflict);
  }
});

test("rejects a cent difference instead of modifying the invoice to fit the OC", () => {
  const { invoice, order } = records();
  order.totalAmount = money("1499999.99");
  assert.throws(() => assertPaidInvoicePoReconciliation(invoice, order, pair, scope), conflict);
});

test("rejects an already linked invoice, fiscal note, or subcontract invoice", () => {
  for (const patch of [
    { purchaseOrderId: "other" },
    { documentKind: "CREDIT_NOTE" },
    { subcontractCertificationId: "cert" },
  ]) {
    const { invoice, order } = records();
    Object.assign(invoice, patch);
    assert.throws(() => assertPaidInvoicePoReconciliation(invoice, order, pair, scope), conflict);
  }
});

test("rejects an OC already billed by an active document", () => {
  const { invoice, order } = records();
  order.supplierInvoices = [{ id: "existing-invoice" }];
  assert.throws(() => assertPaidInvoicePoReconciliation(invoice, order, pair, scope), conflict);
});

test("rejects ambiguous line matching and incomplete reception", () => {
  for (const change of [
    "extra-line",
    "wrong-id",
    "partial-receipt",
    "wrong-quantity",
    "apu",
    "no-wbs",
  ]) {
    const { invoice, order } = records();
    if (change === "extra-line") invoice.lines.push({ ...invoice.lines[0]!, id: "extra" });
    if (change === "wrong-id") order.lines[0]!.id = "other";
    if (change === "partial-receipt") order.lines[0]!.receivedQuantity = money("0.5");
    if (change === "wrong-quantity") invoice.lines[0]!.quantity = money("2");
    if (change === "apu") invoice.lines[0]!.costAnalysisLineId = "apu";
    if (change === "no-wbs") order.lines[0]!.wbsNodeId = null;
    assert.throws(() => assertPaidInvoicePoReconciliation(invoice, order, pair, scope), conflict);
  }
});

test("rejects partial payments or applied credits", () => {
  for (const change of ["status", "paid", "credit", "missing"]) {
    const { invoice, order } = records();
    if (change === "status") invoice.payable!.status = "PARTIAL";
    if (change === "paid") invoice.payable!.paidAmount = money("1499999");
    if (change === "credit") invoice.payable!.creditedAmount = money("1");
    if (change === "missing") invoice.payable = null;
    assert.throws(() => assertPaidInvoicePoReconciliation(invoice, order, pair, scope), conflict);
  }
});

test("requires platform authorization before accessing tenant documents", async () => {
  // The guard must reject an unknown operator rather than accepting supplied tenant roles.
  const { prisma } = await import("@bloqer/database");
  const original = prisma.user.findUnique;
  prisma.user.findUnique = (async () => null) as unknown as typeof original;
  try {
    await assert.rejects(
      () =>
        reconcilePaidSupplierInvoicesWithPurchaseOrders(
          { ...scope, reason: "Documentary reconciliation", pairs: [pair] },
          { actorUserId: "unknown" },
        ),
      (error: unknown) => error instanceof ServiceError && error.code === "FORBIDDEN",
    );
  } finally {
    prisma.user.findUnique = original;
  }
});

test("a reconciliation preserves paid fiscal documents and writes only the explicit links, WBS and audit", async () => {
  const { prisma } = await import("@bloqer/database");
  const originals = {
    user: prisma.user.findUnique,
    platform: prisma.platformAdmin.findFirst,
    transaction: prisma.$transaction,
  };
  const { invoice, order } = records();
  const date = new Date(pair.expectedInvoiceUpdatedAt);
  const writes: Array<{ entity: string; data: Record<string, unknown> }> = [];
  const storedInvoice = {
    ...invoice,
    id: pair.invoiceId,
    number: 27,
    issueDate: date,
    updatedAt: date,
    lines: [{ ...invoice.lines[0]!, wbsNodeId: "old-wbs", updatedAt: date }],
    payable: { ...invoice.payable!, ...scope, supplierContactId: invoice.supplierContactId },
    apPayments: [
      {
        id: "payment",
        ...scope,
        supplierContactId: invoice.supplierContactId,
        amount: invoice.totalAmount,
        paymentDate: date,
      },
    ],
    creditDebitNotes: [],
  };
  const before = JSON.stringify(storedInvoice);
  const tx = {
    company: { findFirst: async () => ({ id: scope.companyId }) },
    project: { findFirst: async () => ({ id: scope.projectId }) },
    $queryRaw: async () => [],
    supplierInvoice: {
      findFirst: async () => storedInvoice,
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ entity: "invoice", data });
        return { count: 1 };
      },
    },
    purchaseOrder: {
      findFirst: async () => ({ ...order, id: pair.purchaseOrderId, number: 6, updatedAt: date }),
    },
    wbsNode: { findFirst: async () => ({ id: "wbs" }) },
    period: { findFirst: async () => null },
    journalEntry: { count: async () => 0 },
    supplierInvoiceLine: {
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ entity: "line", data });
        return { count: 1 };
      },
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ entity: "audit", data });
        return data;
      },
    },
  };
  prisma.user.findUnique = (async () => ({
    email: "operator@example.invalid",
  })) as unknown as typeof originals.user;
  prisma.platformAdmin.findFirst = (async () => ({
    id: "platform-admin",
  })) as unknown as typeof originals.platform;
  prisma.$transaction = (async (run: (client: typeof tx) => Promise<unknown>) =>
    run(tx)) as unknown as typeof originals.transaction;
  try {
    const result = await reconcilePaidSupplierInvoicesWithPurchaseOrders(
      {
        ...scope,
        pairs: [pair],
        reason: "Explicit documentary reconciliation authorized by Owner",
      },
      { actorUserId: "operator" },
    );
    assert.equal(JSON.stringify(storedInvoice), before);
    assert.deepEqual(result, [
      { invoiceId: pair.invoiceId, purchaseOrderId: pair.purchaseOrderId, wbsNodeId: "wbs" },
    ]);
    assert.deepEqual(writes.find((w) => w.entity === "invoice")?.data, {
      purchaseOrderId: pair.purchaseOrderId,
      updatedBy: "operator",
    });
    assert.deepEqual(writes.find((w) => w.entity === "line")?.data, {
      purchaseOrderLineId: pair.purchaseOrderLineId,
      wbsNodeId: "wbs",
    });
    assert.equal(writes.find((w) => w.entity === "audit")?.data.actorUserId, "operator");
    assert.equal(writes.length, 3);
  } finally {
    prisma.user.findUnique = originals.user;
    prisma.platformAdmin.findFirst = originals.platform;
    prisma.$transaction = originals.transaction;
  }
});
