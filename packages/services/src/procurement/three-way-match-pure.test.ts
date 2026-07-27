import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@bloqer/database";
import {
  evaluateThreeWayLineQtyMatch,
  invoiceExceedsReceivedWithTolerance,
  maxReceivableQtyWithTolerance,
} from "./three-way-match-pure";

describe("maxReceivableQtyWithTolerance [BR-PUR-006]", () => {
  it("with 0% tolerance equals remaining", () => {
    const max = maxReceivableQtyWithTolerance(
      new Prisma.Decimal(10),
      new Prisma.Decimal(7),
      new Prisma.Decimal(0),
    );
    assert.equal(max.toFixed(4), "3.0000");
  });

  it("with 5% tolerance allows over-receipt on order qty", () => {
    // order 100, received 0 → max 105
    const max = maxReceivableQtyWithTolerance(
      new Prisma.Decimal(100),
      new Prisma.Decimal(0),
      new Prisma.Decimal(5),
    );
    assert.equal(max.toFixed(4), "105.0000");
  });

  it("caps tolerance at 5%", () => {
    const max = maxReceivableQtyWithTolerance(
      new Prisma.Decimal(100),
      new Prisma.Decimal(0),
      new Prisma.Decimal(20),
    );
    assert.equal(max.toFixed(4), "105.0000");
  });
});

describe("evaluateThreeWayLineQtyMatch [BR-PUR-012]", () => {
  it("OK when invoiced within received", () => {
    const r = evaluateThreeWayLineQtyMatch(
      {
        poLineId: "l1",
        description: "Cemento",
        orderQty: new Prisma.Decimal(10),
        receivedQty: new Prisma.Decimal(5),
        invoicedQty: new Prisma.Decimal(5),
      },
      new Prisma.Decimal(0),
    );
    assert.equal(r.status, "OK");
    assert.equal(r.message, null);
  });

  it("WARN when invoiced above received without tolerance", () => {
    const r = evaluateThreeWayLineQtyMatch(
      {
        poLineId: "l1",
        description: "Cemento",
        orderQty: new Prisma.Decimal(10),
        receivedQty: new Prisma.Decimal(5),
        invoicedQty: new Prisma.Decimal(6),
      },
      new Prisma.Decimal(0),
    );
    assert.equal(r.status, "WARN");
    assert.ok(r.message?.includes("supera recibido"));
  });

  it("WARN when invoiced without receipt", () => {
    const r = evaluateThreeWayLineQtyMatch(
      {
        poLineId: "l1",
        description: "Arena",
        orderQty: new Prisma.Decimal(10),
        receivedQty: new Prisma.Decimal(0),
        invoicedQty: new Prisma.Decimal(2),
      },
      new Prisma.Decimal(0),
    );
    assert.equal(r.status, "WARN");
    assert.ok(r.message?.includes("sin recepción"));
  });
});

describe("invoiceExceedsReceivedWithTolerance", () => {
  it("respects tolerance on header amounts", () => {
    assert.equal(
      invoiceExceedsReceivedWithTolerance(
        new Prisma.Decimal(105),
        new Prisma.Decimal(100),
        new Prisma.Decimal(5),
      ),
      false,
    );
    assert.equal(
      invoiceExceedsReceivedWithTolerance(
        new Prisma.Decimal(106),
        new Prisma.Decimal(100),
        new Prisma.Decimal(5),
      ),
      true,
    );
  });

  it("caps tolerance at 25%", () => {
    // 100 received, 130 invoice → within 25% (125 max), over if uncapped 50%
    assert.equal(
      invoiceExceedsReceivedWithTolerance(
        new Prisma.Decimal(130),
        new Prisma.Decimal(100),
        new Prisma.Decimal(50),
      ),
      true,
    );
    assert.equal(
      invoiceExceedsReceivedWithTolerance(
        new Prisma.Decimal(125),
        new Prisma.Decimal(100),
        new Prisma.Decimal(50),
      ),
      false,
    );
  });
});
