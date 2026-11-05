import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import {
  createProductSchema,
  createStockConsumptionSchema,
  createWarehouseSchema,
  createWarehouseTransferSchema,
  updateProductSchema,
} from "./inventory";

const consumption = () => ({
  projectId: randomUUID(),
  warehouseId: randomUUID(),
  productId: randomUUID(),
  quantity: "1",
  movementDate: "2026-11-04",
  idempotencyKey: randomUUID(),
});
const transfer = () => ({
  sourceWarehouseId: randomUUID(),
  destinationWarehouseId: randomUUID(),
  productId: randomUUID(),
  quantity: "1",
  transferDate: "2026-11-04",
  idempotencyKey: randomUUID(),
});
describe("Inventory inputs preserve canonical quantity precision and calendar days", () => {
  it("rejects impossible dates while retaining a valid leap day", () => {
    assert.equal(
      createStockConsumptionSchema.safeParse({ ...consumption(), movementDate: "2026-02-30" })
        .success,
      false,
    );
    assert.equal(
      createWarehouseTransferSchema.safeParse({ ...transfer(), transferDate: "2026-02-29" })
        .success,
      false,
    );
    assert.equal(
      createStockConsumptionSchema.safeParse({ ...consumption(), movementDate: "2028-02-29" })
        .success,
      true,
    );
  });
  it("rounds quantities at four places before testing positivity", () => {
    assert.equal(
      createStockConsumptionSchema.parse({ ...consumption(), quantity: "0.00005" }).quantity,
      "0.0001",
    );
    for (const quantity of ["0", "0.00001", "-1", "NaN", "Infinity"])
      assert.equal(
        createStockConsumptionSchema.safeParse({ ...consumption(), quantity }).success,
        false,
      );
  });
  it("normalizes nominal transfer prices without introducing a currency", () => {
    const input = createWarehouseTransferSchema.parse({ ...transfer(), unitCost: "1,25555" });
    assert.equal(input.unitCost, "1.2556");
    assert.equal("currency" in input, false);
    assert.equal(
      createWarehouseTransferSchema.safeParse({ ...transfer(), unitCost: "-1" }).success,
      false,
    );
  });
  it("distinguishes grouped thousands from canonical four-place transfer prices", () => {
    assert.equal(
      createWarehouseTransferSchema.parse({ ...transfer(), unitCost: "1.255" }).unitCost,
      "1255.0000",
    );
    const canonical = createWarehouseTransferSchema.parse({ ...transfer(), unitCost: "1.2550" });
    assert.equal(canonical.unitCost, "1.2550");
    assert.equal(createWarehouseTransferSchema.parse(canonical).unitCost, "1.2550");
    assert.equal(
      createWarehouseTransferSchema.parse({ ...transfer(), unitCost: "1,255" }).unitCost,
      "1.2550",
    );
  });
  it("rejects whitespace-only catalogue identity while preserving explicit nullable clears", () => {
    assert.equal(createProductSchema.safeParse({ sku: " ", name: "Name" }).success, false);
    assert.equal(
      createWarehouseSchema.safeParse({ companyId: randomUUID(), name: " " }).success,
      false,
    );
    assert.deepEqual(
      updateProductSchema.parse({ notes: null, category: null, description: null }),
      { notes: null, category: null, description: null },
    );
  });
});
