import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@bloqer/database";
import {
  applyOrderedToApuMap,
  buildApuCommitmentMap,
  buildFallbackIndex,
  materialFallbackRowKey,
  shortfallOf,
  serializeApuCommitment,
  type MaterialNeedSeed,
  needQtyFromApuLineExact,
} from "./material-commitment-pure";

const seed = (over: Partial<MaterialNeedSeed> = {}): MaterialNeedSeed => ({
  wbsNodeId: "wbs-1",
  costAnalysisLineId: "apu-1",
  productId: "prod-1",
  description: "Cemento",
  unit: "kg",
  unitCost: "100",
  needQty: 10,
  needCost: "1000.00",
  ...over,
});

describe("material-commitment-pure", () => {
  it("accepts Decimal-like quantity that fails instanceof Prisma.Decimal", () => {
    const map = buildApuCommitmentMap([seed()]);
    const index = buildFallbackIndex(map);
    const foreign = { toString: () => "8" };
    applyOrderedToApuMap(map, index, {
      wbsNodeId: "wbs-1",
      costAnalysisLineId: "apu-1",
      productId: "prod-1",
      description: "Cemento",
      quantity: foreign as unknown as Prisma.Decimal,
    });
    assert.equal(serializeApuCommitment(map.get("apu-1")!).orderedQty, "8.0000");
  });

  it("10 need − OC CONFIRMED 8 → shortfall 2", () => {
    const map = buildApuCommitmentMap([seed()]);
    const index = buildFallbackIndex(map);
    applyOrderedToApuMap(map, index, {
      wbsNodeId: "wbs-1",
      costAnalysisLineId: "apu-1",
      productId: "prod-1",
      description: "Cemento",
      quantity: 8,
      receivedQuantity: 0,
    });
    const view = serializeApuCommitment(map.get("apu-1")!);
    assert.equal(view.needQty, "10.0000");
    assert.equal(view.needCost, "1000.00");
    assert.equal(view.orderedQty, "8.0000");
    assert.equal(view.shortfallQty, "2.0000");
    assert.equal(view.overCommitted, false);
  });

  it("prefers costAnalysisLineId even when description diverges", () => {
    const map = buildApuCommitmentMap([seed()]);
    const index = buildFallbackIndex(map);
    applyOrderedToApuMap(map, index, {
      wbsNodeId: "wbs-1",
      costAnalysisLineId: "apu-1",
      productId: null,
      description: "Cemento Portland (editado)",
      quantity: 3,
    });
    assert.equal(serializeApuCommitment(map.get("apu-1")!).orderedQty, "3.0000");
    assert.equal(serializeApuCommitment(map.get("apu-1")!).shortfallQty, "7.0000");
  });

  it("falls back to product/desc key when costAnalysisLineId missing", () => {
    const map = buildApuCommitmentMap([seed()]);
    const index = buildFallbackIndex(map);
    const matched = applyOrderedToApuMap(map, index, {
      wbsNodeId: "wbs-1",
      costAnalysisLineId: null,
      productId: "prod-1",
      description: "Cemento",
      quantity: 4,
    });
    assert.equal(matched, true);
    assert.equal(serializeApuCommitment(map.get("apu-1")!).shortfallQty, "6.0000");
  });

  it("orphan order without match does not throw and leaves need intact", () => {
    const map = buildApuCommitmentMap([seed()]);
    const index = buildFallbackIndex(map);
    const matched = applyOrderedToApuMap(map, index, {
      wbsNodeId: "wbs-other",
      costAnalysisLineId: null,
      productId: "x",
      description: "Otro",
      quantity: 99,
    });
    assert.equal(matched, false);
    assert.equal(serializeApuCommitment(map.get("apu-1")!).orderedQty, "0.0000");
    assert.equal(serializeApuCommitment(map.get("apu-1")!).shortfallQty, "10.0000");
  });

  it("shortfallOf never goes negative", () => {
    const need = new Prisma.Decimal(10);
    const ordered = new Prisma.Decimal(15);
    assert.equal(shortfallOf(need, ordered).toString(), "0");
  });

  it("materialFallbackRowKey normalizes description whitespace", () => {
    assert.equal(
      materialFallbackRowKey("w", null, "  Cemento   Portland "),
      materialFallbackRowKey("w", null, "cemento portland"),
    );
  });

  it("ambiguous fallback (two APUs same product) does not auto-match without cal id", () => {
    const map = buildApuCommitmentMap([
      seed({ costAnalysisLineId: "apu-a", description: "A" }),
      seed({ costAnalysisLineId: "apu-b", description: "B", needQty: 5 }),
    ]);
    // Same productId → same fallback key → ambiguous
    const index = buildFallbackIndex(map);
    const key = materialFallbackRowKey("wbs-1", "prod-1", "A");
    // Both share prod-1 so key is wbs-1::prod-1 for both — index should omit
    assert.equal(index.has(key), false);
    const matched = applyOrderedToApuMap(map, index, {
      wbsNodeId: "wbs-1",
      costAnalysisLineId: null,
      productId: "prod-1",
      description: "A",
      quantity: 2,
    });
    assert.equal(matched, false);
  });

  it("keeps stored quantity precision above the IEEE safe-integer boundary", () => {
    const need = needQtyFromApuLineExact({ partidaQuantity: "99999999999999.9999", coefficient: "1", itemQuantity: "1", isLumpSum: false, unit: "kg" });
    const map = buildApuCommitmentMap([seed({ needQty: need })]);
    assert.equal(serializeApuCommitment(map.get("apu-1")!).needQty, "99999999999999.9999");
  });

  it("multiplies exact coefficients and item quantities without losing the fourth decimal", () => {
    const need = needQtyFromApuLineExact({ partidaQuantity: null, coefficient: "9999999999.1234", itemQuantity: "9999.9999", isLumpSum: false, unit: "un" });
    assert.equal(need.toFixed(4), "99999998991234.0001");
    assert.equal(needQtyFromApuLineExact({ partidaQuantity: "20", coefficient: "3", itemQuantity: "4", isLumpSum: false, unit: "gl" }).toString(), "0");
    assert.equal(needQtyFromApuLineExact({ partidaQuantity: "20", coefficient: "3", itemQuantity: "4", isLumpSum: true, unit: "un" }).toString(), "0");
  });

  it("rejects an APU from another WBS even when its id exists in the same map", () => {
    const map = buildApuCommitmentMap([seed()]);
    const result = applyOrderedToApuMap(map, buildFallbackIndex(map), { wbsNodeId: "foreign-wbs", costAnalysisLineId: "apu-1", productId: "prod-1", description: "Cemento", quantity: "9" });
    assert.equal(result, false);
    assert.equal(serializeApuCommitment(map.get("apu-1")!).orderedQty, "0.0000");
  });

  it("does not replace a foreign explicit APU hint with a name/product match", () => {
    const map = buildApuCommitmentMap([seed()]);
    assert.equal(applyOrderedToApuMap(map, buildFallbackIndex(map), { wbsNodeId: "wbs-1", costAnalysisLineId: "foreign-apu", productId: "prod-1", description: "Cemento", quantity: "9" }), false);
    assert.equal(serializeApuCommitment(map.get("apu-1")!).orderedQty, "0.0000");
  });

  it("does not cover kilograms with bags, preserving the full physical shortfall", () => {
    const map = buildApuCommitmentMap([seed()]);
    assert.equal(applyOrderedToApuMap(map, buildFallbackIndex(map), { wbsNodeId: "wbs-1", costAnalysisLineId: "apu-1", productId: "prod-1", description: "Cemento", unit: "bolsa", quantity: "9" }), false);
    assert.equal(serializeApuCommitment(map.get("apu-1")!).shortfallQty, "10.0000");
  });
});
