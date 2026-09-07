import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isResourceBoardCategory,
  isMistypedMaterialOnResourceBoard,
  resourceBoardFromParam,
  resourceCoverageShortfall,
  resourceFallbackRowKey,
  resourceRowKey,
  RESOURCE_BOARD_LABELS_ES,
  RESOURCE_BOARD_ROUTE_SEGMENT,
} from "./resource-board-pure";

test("resource board category guards", () => {
  assert.equal(isResourceBoardCategory("LABOR"), true);
  assert.equal(isResourceBoardCategory("EQUIPMENT"), true);
  assert.equal(isResourceBoardCategory("MATERIAL"), false);
  assert.equal(resourceBoardFromParam("mano-obra"), "LABOR");
  assert.equal(resourceBoardFromParam("equipos"), "EQUIPMENT");
  assert.equal(RESOURCE_BOARD_LABELS_ES.LABOR, "Mano de obra");
  assert.equal(RESOURCE_BOARD_ROUTE_SEGMENT.EQUIPMENT, "equipos");
});

test("resource row keys prefer APU id", () => {
  assert.equal(resourceRowKey("w1", "apu-1", "Jornal"), "w1::apu:apu-1");
  assert.equal(resourceFallbackRowKey("w1", "  Jornal  "), "w1::d:jornal");
  assert.equal(resourceRowKey("w1", null, "Jornal"), "w1::d:jornal");
});

test("resourceCoverageShortfall uses max(ordered, invoiced)", () => {
  assert.equal(resourceCoverageShortfall(10, 3, 7), 3);
  assert.equal(resourceCoverageShortfall(10, 10, 4), 0);
  assert.equal(resourceCoverageShortfall(10, 12, 8), 0);
  assert.equal(resourceCoverageShortfall(5, 0, 0), 5);
  assert.equal(resourceCoverageShortfall(0, 2, 1), 0);
});

test("isMistypedMaterialOnResourceBoard ignores free-text MATERIAL as LAB/EQP", () => {
  assert.equal(
    isMistypedMaterialOnResourceBoard({
      boardCategory: "LABOR",
      costType: "LABOR",
      lineType: "MATERIAL",
      costAnalysisLineId: null,
    }),
    true,
  );
  assert.equal(
    isMistypedMaterialOnResourceBoard({
      boardCategory: "LABOR",
      costType: "LABOR",
      lineType: "SERVICE",
      costAnalysisLineId: null,
    }),
    false,
  );
  assert.equal(
    isMistypedMaterialOnResourceBoard({
      boardCategory: "LABOR",
      costType: "LABOR",
      lineType: "MATERIAL",
      costAnalysisLineId: "apu-1",
    }),
    false,
  );
  assert.equal(
    isMistypedMaterialOnResourceBoard({
      boardCategory: "EQUIPMENT",
      costType: "MATERIAL",
      lineType: "MATERIAL",
      costAnalysisLineId: null,
    }),
    false,
  );
});