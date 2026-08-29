import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@bloqer/database";
import { computeCostExposureLayers } from "./cost-exposure";
import { dominantCostTypeByWbs, resolveLineCostType } from "./cost-type";

const dec = (v: string | number) => new Prisma.Decimal(v);

describe("resolveLineCostType [D-099]", () => {
  it("prefers the explicit line type over the APU category", () => {
    assert.equal(resolveLineCostType({ costType: "LABOR", apuCategory: "MATERIAL" }), "LABOR");
  });

  it("falls back to the APU category, then to MATERIAL", () => {
    assert.equal(resolveLineCostType({ costType: null, apuCategory: "EQUIPMENT" }), "EQUIPMENT");
    assert.equal(resolveLineCostType({ costType: null, apuCategory: null }), "MATERIAL");
  });
});

describe("dominantCostTypeByWbs [D-099]", () => {
  it("picks the category holding most committed money on each partida", () => {
    const map = dominantCostTypeByWbs([
      { wbsNodeId: "wbs-1", lineSubtotal: dec(1000), costType: "MATERIAL" },
      { wbsNodeId: "wbs-1", lineSubtotal: dec(4000), costType: "LABOR" },
      { wbsNodeId: "wbs-2", lineSubtotal: dec(500), costType: null },
    ]);
    assert.equal(map.get("wbs-1"), "LABOR");
    assert.equal(map.get("wbs-2"), "MATERIAL");
  });

  it("ignores lines without a partida", () => {
    const map = dominantCostTypeByWbs([
      { wbsNodeId: null, lineSubtotal: dec(9000), costType: "EQUIPMENT" },
    ]);
    assert.equal(map.size, 0);
  });
});

describe("typed buckets keep the partida total [D-099]", () => {
  it("does not duplicate exposure when the invoice is re-typed against the OC", () => {
    // OC 10k typed MATERIAL, invoice 10k re-typed LABOR and linked to that OC line.
    const rowLayers = computeCostExposureLayers({
      committed: dec(10000),
      accrued: dec(10000),
      accruedLinked: dec(10000),
    });

    // Spend lands on LABOR; the released commitment leaves the MATERIAL bucket.
    const material = computeCostExposureLayers({
      committed: dec(10000),
      accrued: dec(0),
      accruedLinked: dec(10000),
    });
    const labor = computeCostExposureLayers({
      committed: dec(0),
      accrued: dec(10000),
      accruedLinked: dec(0),
    });

    const bucketSum = material.expectedCostExposure.add(labor.expectedCostExposure);
    assert.equal(bucketSum.toFixed(2), rowLayers.expectedCostExposure.toFixed(2));
    assert.equal(material.openCommitted.toFixed(2), "0.00");
  });

  it("keeps open commitment in the OC bucket while the invoice is partial", () => {
    const material = computeCostExposureLayers({
      committed: dec(10000),
      accrued: dec(0),
      accruedLinked: dec(4000),
    });
    const labor = computeCostExposureLayers({
      committed: dec(0),
      accrued: dec(4000),
      accruedLinked: dec(0),
    });
    const row = computeCostExposureLayers({
      committed: dec(10000),
      accrued: dec(4000),
      accruedLinked: dec(4000),
    });

    assert.equal(material.openCommitted.toFixed(2), "6000.00");
    assert.equal(
      material.expectedCostExposure.add(labor.expectedCostExposure).toFixed(2),
      row.expectedCostExposure.toFixed(2),
    );
  });
});
