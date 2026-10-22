import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMeasurementTree } from "./measurement-tree";

const nodes = [
  { id: "parent", parentId: null, code: "1", name: "Trabajos preliminares", isGroup: true },
  { id: "nested", parentId: "parent", code: "1.1", name: "Preparación", isGroup: true },
  { id: "leaf", parentId: "nested", code: "1.1.1", name: "Oficina Técnica", isGroup: false },
  { id: "later", parentId: "parent", code: "1.10", name: "Replanteo", isGroup: false },
  { id: "early", parentId: "parent", code: "1.2", name: "Limpieza", isGroup: false },
];
test("collapsing hides descendants without removing the parent or changing the count", () => {
  const result = buildMeasurementTree(nodes, "", new Set(["parent"]));
  assert.deepEqual(
    result.map((node) => node.id),
    ["parent"],
  );
  assert.equal(result[0]!.itemCount, 3);
});
test("search ignores accents, reveals collapsed ancestors and restores collapse afterwards", () => {
  const collapsed = new Set(["parent", "nested"]);
  const result = buildMeasurementTree(nodes, "tecnica", collapsed);
  assert.deepEqual(
    result.map((node) => node.id),
    ["parent", "nested", "leaf"],
  );
  assert.equal(result[2]!.depth, 2);
  assert.equal(buildMeasurementTree(nodes, "", collapsed).length, 1);
});
test("matching a group includes descendants in numeric WBS order", () => {
  assert.deepEqual(
    buildMeasurementTree(nodes, "preliminares", new Set()).map((node) => node.id),
    ["parent", "nested", "leaf", "early", "later"],
  );
  assert.equal(buildMeasurementTree(nodes, "sin coincidencia", new Set()).length, 0);
});
