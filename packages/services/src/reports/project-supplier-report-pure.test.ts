import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@bloqer/database";
import { buildProjectSupplierReport } from "./project-supplier-report-pure";

function d(n: number | string) {
  return new Prisma.Decimal(n);
}

describe("buildProjectSupplierReport", () => {
  it("ranks leaders by exposure, PO count and open payable", () => {
    const report = buildProjectSupplierReport({
      purchaseOrders: [
        {
          id: "po-a1",
          supplierContactId: "a",
          supplierName: "Acme Hierros",
          status: "CONFIRMED",
          issueDate: new Date("2026-01-10"),
          lineSubtotal: d(10000),
        },
        {
          id: "po-a2",
          supplierContactId: "a",
          supplierName: "Acme Hierros",
          status: "PARTIALLY_RECEIVED",
          issueDate: new Date("2026-02-01"),
          lineSubtotal: d(4000),
        },
        {
          id: "po-b1",
          supplierContactId: "b",
          supplierName: "Beta Sanitarios",
          status: "RECEIVED",
          issueDate: new Date("2026-01-15"),
          lineSubtotal: d(3000),
        },
      ],
      invoices: [
        {
          id: "inv-a",
          supplierContactId: "a",
          supplierName: "Acme Hierros",
          issueDate: new Date("2026-02-10"),
          netAmount: d(4000),
          paidAmount: d(1000),
          purchaseOrderId: "po-a1",
        },
        {
          id: "inv-c",
          supplierContactId: "c",
          supplierName: "Cables Directos",
          issueDate: new Date("2026-03-01"),
          netAmount: d(2500),
          paidAmount: d(0),
          purchaseOrderId: null,
        },
      ],
      payables: [
        {
          supplierContactId: "c",
          supplierName: "Cables Directos",
          balanceDue: d(5500),
          overdueAmount: d(2500),
        },
        {
          supplierContactId: "a",
          supplierName: "Acme Hierros",
          balanceDue: d(3000),
          overdueAmount: d(0),
        },
      ],
      receipts: [
        {
          supplierContactId: "b",
          supplierName: "Beta Sanitarios",
          receiptDate: new Date("2026-01-20"),
        },
      ],
    });

    assert.equal(report.totals.supplierCount, 3);
    assert.equal(report.totals.poCount, 3);
    assert.equal(report.totals.invoiceCount, 2);
    assert.equal(report.totals.receiptCount, 1);
    assert.equal(report.totals.committedCost, "17000.00");
    assert.equal(report.totals.accruedCost, "6500.00");
    assert.equal(report.totals.paidCost, "1000.00");
    // A: committed 14k, linked 4k → open 10k, exposure 14k
    // B: committed 3k, linked 0 → open 3k, exposure 3k
    // C: committed 0, unlinked 2.5k → open 0, exposure 2.5k
    assert.equal(report.totals.openCommitted, "13000.00");
    assert.equal(report.totals.expectedExposure, "19500.00");
    assert.equal(report.totals.payableBalance, "8500.00");
    assert.equal(report.totals.avgPoAmount, "5666.67");

    const acme = report.rows.find((r) => r.supplierContactId === "a")!;
    assert.equal(acme.poCount, 2);
    assert.equal(acme.openPoCount, 2);
    assert.equal(acme.committedCost, "14000.00");
    assert.equal(acme.openCommitted, "10000.00");
    assert.equal(acme.expectedExposure, "14000.00");
    assert.equal(acme.shareOfExposurePct, "71.79");
    assert.equal(acme.lastActivityDate, "2026-02-10");

    assert.equal(report.leadersByAmount[0]?.supplierContactId, "a");
    assert.equal(report.leadersByOrders[0]?.supplierContactId, "a");
    assert.equal(report.leadersByOrders[0]?.value, "2");
    assert.equal(report.leadersByPayable[0]?.supplierContactId, "c");
    assert.equal(report.totals.top1SharePct, "71.79");
  });

  it("excludes zero-exposure suppliers from amount leaders and skips concentration", () => {
    const report = buildProjectSupplierReport({
      purchaseOrders: [],
      invoices: [],
      payables: [
        {
          supplierContactId: "p",
          supplierName: "Solo CxP",
          balanceDue: d(800),
          overdueAmount: d(800),
        },
      ],
      receipts: [],
    });
    assert.equal(report.rows.length, 1);
    assert.equal(report.leadersByAmount.length, 0);
    assert.equal(report.leadersByPayable[0]?.supplierContactId, "p");
    assert.equal(report.totals.top1SharePct, null);
    assert.equal(report.totals.top3SharePct, null);
  });

  it("does not invent OTIF and keeps empty leaders when there is no activity", () => {
    const report = buildProjectSupplierReport({
      purchaseOrders: [],
      invoices: [],
      payables: [],
      receipts: [],
    });
    assert.equal(report.rows.length, 0);
    assert.equal(report.leadersByAmount.length, 0);
    assert.equal(report.leadersByOrders.length, 0);
    assert.equal(report.leadersByPayable.length, 0);
    assert.equal(report.totals.top3SharePct, null);
    assert.equal(report.totals.avgPoAmount, null);
  });
});
