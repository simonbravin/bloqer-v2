import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertProductUnitCompatible,
  canEditProductUnit,
  lockProductsForUnitReferences,
  normalizeProductUnit,
} from "./product-unit";

describe("D130 physical product units", () => {
  it("normalizes spelling only and retains explicit custom units", () => {
    assert.equal(normalizeProductUnit(" KG "), "kg");
    assert.doesNotThrow(() => assertProductUnitCompatible(" Custom pack ", "custom PACK"));
    for (const [product, document] of [
      ["kg", "t"],
      ["m2", "m²"],
      ["", ""],
      ["un", " "],
    ]) {
      assert.throws(() => assertProductUnitCompatible(product!, document!), /unidad/);
    }
  });
  it("freezes the unit for each existing reference family regardless of lifecycle", () => {
    const empty = {
      purchaseRequestLines: 0,
      purchaseOrderLines: 0,
      costAnalysisLines: 0,
      jobsiteLogMaterials: 0,
      warehouseTransfers: 0,
      stockMovements: 0,
    };
    assert.equal(canEditProductUnit(empty), true);
    for (const key of Object.keys(empty))
      assert.equal(canEditProductUnit({ ...empty, [key]: 1 }), false);
  });
  it("locks a batch once in canonical product order within its tenant", async () => {
    const calls: Array<[string, string, string]> = [];
    const tx = {
      $queryRaw: async (sql: TemplateStringsArray, id: string, tenant: string) => {
        calls.push([sql.join("?"), id, tenant]);
      },
    };
    await lockProductsForUnitReferences(
      tx as unknown as Parameters<typeof lockProductsForUnitReferences>[0],
      ["b", "a", "b"],
      "tenant",
    );
    assert.deepEqual(
      calls.map((call) => call.slice(1)),
      [
        ["a", "tenant"],
        ["b", "tenant"],
      ],
    );
    assert.ok(
      calls.every((call) => call[0].includes('"tenantId"') && call[0].includes("FOR UPDATE")),
    );
  });
});
