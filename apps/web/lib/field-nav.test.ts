import assert from "node:assert/strict";
import { test } from "node:test";
import { isFieldImmersivePath } from "./field-immersive-routes";
import { listFieldQuickActions } from "./field-quick-actions";

test("immersive paths hide bottom nav", () => {
  assert.equal(isFieldImmersivePath("/proyectos/abc/libro-obra/nuevo"), true);
  assert.equal(isFieldImmersivePath("/proyectos/abc/solicitudes-compra/nueva"), true);
  assert.equal(isFieldImmersivePath("/proyectos/abc/ordenes-compra/po1/recepciones/nueva"), true);
  assert.equal(isFieldImmersivePath("/proyectos/abc/libro-obra"), false);
  assert.equal(isFieldImmersivePath("/dashboard"), false);
});

test("VIEWER has no field create actions", () => {
  const actions = listFieldQuickActions(["VIEWER"], () => true);
  assert.equal(actions.length, 0);
});

test("PROJECT_MANAGER can create parte and SC but not consumption", () => {
  const ids = listFieldQuickActions(["PROJECT_MANAGER"], () => true).map((a) => a.id);
  assert.equal(ids.includes("jobsiteLog"), true);
  assert.equal(ids.includes("purchaseRequest"), true);
  assert.equal(ids.includes("document"), true);
  assert.equal(ids.includes("consumption"), false);
});

test("OWNER can register consumption", () => {
  const ids = listFieldQuickActions(["OWNER"], () => true).map((a) => a.id);
  assert.equal(ids.includes("consumption"), true);
});
