import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@bloqer/database";
import {
  buildAutoFromPoInternalNotes,
  buildInvoiceDraftLinesFromPo,
  computePendingToInvoiceAmount,
  formatInvoiceLineQuantity,
  poLineReceivedAmount,
  sumPoLinesReceivedAmount,
  type PoLineForInvoiceDraft,
} from "./supplier-invoice-from-po-pure";

const sampleLine: PoLineForInvoiceDraft = {
  id: "line-1",
  description: "Cemento",
  unitPrice: "100",
  taxRate: "21",
  orderQuantity: "10",
  receivedQuantity: "5",
  lineTotal: "1210",
};

test("buildAutoFromPoInternalNotes includes receipt when provided", () => {
  assert.equal(buildAutoFromPoInternalNotes("po-1"), "bloqer:auto-from-po:po-1");
  assert.equal(
    buildAutoFromPoInternalNotes("po-1", "rcpt-1"),
    "bloqer:auto-from-po:po-1:receipt:rcpt-1",
  );
});

test("poLineReceivedAmount is proportional to received qty", () => {
  const amount = poLineReceivedAmount(sampleLine);
  assert.equal(amount.toFixed(2), "605.00");
});

test("sumPoLinesReceivedAmount aggregates lines", () => {
  const total = sumPoLinesReceivedAmount([sampleLine, { ...sampleLine, id: "line-2", receivedQuantity: "0" }]);
  assert.equal(total.toFixed(2), "605.00");
});

test("computePendingToInvoiceAmount never goes negative", () => {
  assert.equal(
    computePendingToInvoiceAmount(new Prisma.Decimal(100), new Prisma.Decimal(150)).toString(),
    "0",
  );
  assert.equal(
    computePendingToInvoiceAmount(new Prisma.Decimal(100), new Prisma.Decimal(40)).toString(),
    "60",
  );
});

test("buildInvoiceDraftLinesFromPo uses received quantities", () => {
  const lines = buildInvoiceDraftLinesFromPo([sampleLine], {
    basis: "received",
    receivedAmount: new Prisma.Decimal(605),
    invoicedAmount: new Prisma.Decimal(0),
  });
  assert.equal(lines.length, 1);
  assert.equal(lines[0]!.quantity, "5");
  assert.equal(lines[0]!.unitPrice, "100");
});

test("buildInvoiceDraftLinesFromPo scales remaining basis", () => {
  const lines = buildInvoiceDraftLinesFromPo([sampleLine], {
    basis: "remaining",
    receivedAmount: new Prisma.Decimal(100),
    invoicedAmount: new Prisma.Decimal(50),
  });
  assert.equal(lines.length, 1);
  assert.equal(lines[0]!.quantity, "2.5");
});

test("buildInvoiceDraftLinesFromPo filters by receipt quantities", () => {
  const lines = buildInvoiceDraftLinesFromPo(
    [sampleLine, { ...sampleLine, id: "line-2", description: "Arena", receivedQuantity: "3" }],
    {
      basis: "received",
      receiptQuantities: new Map([["line-2", "2"]]),
      receivedAmount: new Prisma.Decimal(100),
      invoicedAmount: new Prisma.Decimal(0),
    },
  );
  assert.equal(lines.length, 1);
  assert.equal(lines[0]!.description, "Arena");
  assert.equal(lines[0]!.quantity, "2");
});

test("buildInvoiceDraftLinesFromPo returns empty when no received qty", () => {
  const lines = buildInvoiceDraftLinesFromPo(
    [{ ...sampleLine, receivedQuantity: "0" }],
    {
      basis: "received",
      receivedAmount: new Prisma.Decimal(0),
      invoicedAmount: new Prisma.Decimal(0),
    },
  );
  assert.equal(lines.length, 0);
});

test("formatInvoiceLineQuantity preserves integer and decimal quantities", () => {
  assert.equal(formatInvoiceLineQuantity(new Prisma.Decimal(100)), "100");
  assert.equal(formatInvoiceLineQuantity(new Prisma.Decimal(10)), "10");
  assert.equal(formatInvoiceLineQuantity(new Prisma.Decimal(2.5)), "2.5");
});
