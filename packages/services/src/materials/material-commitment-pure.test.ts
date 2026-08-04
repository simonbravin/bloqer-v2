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
} from "./material-commitment-pure";

const seed = (over: Partial<MaterialNeedSeed> = {}): MaterialNeedSeed => ({
  wbsNodeId: "wbs-1",
  costAnalysisLineId: "apu-1",
  productId: "prod-1",
  description: "Cemento",
  unit: "kg",
  unitCost: "100",
  needQty: 10,
  needCost: 1000,
  ...over,
});

describe("material-commitment-pure", () => {
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
});
