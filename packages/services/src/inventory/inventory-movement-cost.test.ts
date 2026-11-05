import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@bloqer/database";
import { inventoryMovementCostProvenance } from "./inventory-movement-cost";

const receipt = (totalCost: string) => ({
  sourceType: "PURCHASE_RECEIPT",
  quantity: new Prisma.Decimal("1.2345"),
  unitCost: new Prisma.Decimal("2.3456"),
  totalCost: new Prisma.Decimal(totalCost),
  purchaseReceiptLine: {
    purchaseOrderLine: {
      unitPrice: new Prisma.Decimal("2.3456"),
      purchaseOrder: { currency: "USD" },
    },
  },
});

describe("Inventory movement cost provenance shared by ledger and reports", () => {
  it("keeps proven native currency for canonical two-place and historical four-place totals", () => {
    for (const amount of ["2.90", "2.8956"]) {
      assert.deepEqual(inventoryMovementCostProvenance(receipt(amount)), {
        costCurrency: "USD",
        costWarning: null,
      });
    }
  });
  it("withholds currency for a receipt nominal that no longer matches its total or source price", () => {
    const changedPrice = receipt("2.90");
    changedPrice.unitCost = new Prisma.Decimal("3");
    for (const row of [receipt("900"), changedPrice]) {
      const cost = inventoryMovementCostProvenance(row);
      assert.equal(cost.costCurrency, null);
      assert.match(cost.costWarning!, /Sin valuación comparable/);
    }
  });
  it("requires line-level cost provenance rather than only a receipt header", () => {
    const cost = inventoryMovementCostProvenance({ ...receipt("2.90"), purchaseReceiptLine: null });
    assert.equal(cost.costCurrency, null);
    assert.ok(cost.costWarning);
  });
  it("never infers a valued consumption or transfer from receipt-like nominal fields", () => {
    for (const sourceType of ["CONSUMPTION", "TRANSFER"]) {
      const cost = inventoryMovementCostProvenance({ ...receipt("2.90"), sourceType });
      assert.equal(cost.costCurrency, null);
      assert.ok(cost.costWarning);
    }
  });
});
