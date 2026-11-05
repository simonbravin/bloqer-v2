import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@bloqer/database";
import {
  assertInventoryMovementParentScope,
  inventoryProductWhere,
  type InventoryMovementWithParents,
} from "./inventory-scope";
import { lockStockBalanceKeys, stockMovementQuantityDelta } from "./stock-balance.service";
import { createReceiptStockMovement } from "./stock-movement.service";
import type { ServiceContext } from "../types";

function movement(): InventoryMovementWithParents {
  return {
    tenantId: "tenant",
    companyId: "company",
    projectId: "project",
    warehouseId: "warehouse",
    productId: "product",
    warehouse: { tenantId: "tenant", companyId: "company", projectId: null },
    product: { tenantId: "tenant", companyId: null },
    project: { tenantId: "tenant", companyId: null },
    wbsNodeId: "wbs",
    wbsNode: { budget: { tenantId: "tenant", companyId: null, projectId: "project" } },
    purchaseReceiptId: null,
    purchaseReceiptLineId: null,
    warehouseTransferId: null,
  } as unknown as InventoryMovementWithParents;
}
describe("Inventory parent graph and physical stock rules", () => {
  it("accepts a shared budget and product for an own-company movement on a shared project", () => {
    assert.doesNotThrow(() => assertInventoryMovementParentScope(movement()));
  });
  it("rejects contradictory tenant company project and WBS parents", () => {
    for (const edit of [
      (m: InventoryMovementWithParents) => {
        m.product.tenantId = "foreign";
      },
      (m: InventoryMovementWithParents) => {
        m.product.companyId = "foreign";
      },
      (m: InventoryMovementWithParents) => {
        m.warehouse.companyId = "foreign";
      },
      (m: InventoryMovementWithParents) => {
        m.project!.tenantId = "foreign";
      },
      (m: InventoryMovementWithParents) => {
        m.wbsNode!.budget.companyId = "foreign";
      },
      (m: InventoryMovementWithParents) => {
        m.wbsNode!.budget.projectId = "foreign";
      },
    ]) {
      const m = movement();
      edit(m);
      assert.throws(() => assertInventoryMovementParentScope(m), /inconsistentes/);
    }
  });
  it("does not permit caller company filters to widen an active-company catalogue", () => {
    const ctx: ServiceContext = {
      tenantId: "tenant",
      companyId: "company",
      actorUserId: "actor",
      roles: ["OWNER"],
    };
    assert.throws(() => inventoryProductWhere(ctx, "foreign"), /autorizado/);
    assert.deepEqual(inventoryProductWhere(ctx).OR, [
      { companyId: "company" },
      { companyId: null },
    ]);
  });
  it("locks every warehouse before any product and sorts both sets", async () => {
    const calls: string[] = [];
    const tx = {
      $queryRaw: async (strings: TemplateStringsArray, value: string) => {
        calls.push((strings[0]!.includes("warehouses") ? "w:" : "p:") + value);
      },
    } as unknown as Parameters<typeof lockStockBalanceKeys>[0];
    await lockStockBalanceKeys(tx, [
      { warehouseId: "b", productId: "a" },
      { warehouseId: "a", productId: "b" },
      { warehouseId: "a", productId: "a" },
    ]);
    assert.deepEqual(calls, ["w:a", "w:b", "p:a", "p:b"]);
  });
  it("uses exact directional quantities and never invents an adjustment direction", () => {
    assert.equal(
      stockMovementQuantityDelta({ type: "OUT", quantity: new Prisma.Decimal("1.2345") }).toFixed(
        4,
      ),
      "-1.2345",
    );
    assert.equal(
      stockMovementQuantityDelta({ type: "ADJUSTMENT", quantity: new Prisma.Decimal("2") }).toFixed(
        4,
      ),
      "0.0000",
    );
    assert.throws(
      () => stockMovementQuantityDelta({ type: "IN", quantity: new Prisma.Decimal("-1") }),
      /cantidad/,
    );
  });
  it("captures new receipt totals at two money decimals without rounding unit price or quantity early", async () => {
    let captured: Prisma.StockMovementUncheckedCreateInput | undefined;
    const tx = {
      stockMovement: {
        create: async (args: { data: Prisma.StockMovementUncheckedCreateInput }) => {
          captured = args.data;
          return args.data;
        },
      },
    } as unknown as Parameters<typeof createReceiptStockMovement>[0];
    const input = {
      tenantId: "tenant",
      companyId: "company",
      warehouseId: "warehouse",
      productId: "product",
      projectId: null,
      purchaseReceiptId: "receipt",
      purchaseReceiptLineId: "line",
      quantity: new Prisma.Decimal("1.2345"),
      unitCost: new Prisma.Decimal("2.3456"),
      movementDate: new Date("2026-11-04T00:00:00Z"),
      createdBy: "actor",
    };
    await createReceiptStockMovement(tx, input);
    assert.ok(new Prisma.Decimal(captured!.totalCost as Prisma.Decimal).eq("2.90"));
    assert.equal(new Prisma.Decimal(captured!.unitCost as Prisma.Decimal).toFixed(4), "2.3456");
    await createReceiptStockMovement(tx, {
      ...input,
      quantity: new Prisma.Decimal(1),
      unitCost: new Prisma.Decimal("1.005"),
    });
    assert.ok(new Prisma.Decimal(captured!.totalCost as Prisma.Decimal).eq("1.01"));
  });
});
