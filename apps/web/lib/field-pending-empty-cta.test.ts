import assert from "node:assert/strict";
import { test } from "node:test";
import { fieldPendingEmptyObraCta } from "./field-pending-empty-cta";

const a = { id: "a", code: "DEMO-001" };
const b = { id: "b", code: "DEMO-002" };

test("empty CTA uses the filtered or locked project", () => {
  const cta = fieldPendingEmptyObraCta({
    projectId: "b",
    projects: [a, b],
    lastProjectId: "a",
  });
  assert.equal(cta.href, "/proyectos/b");
  assert.equal(cta.label, "Volver a DEMO-002");
});

test("empty CTA uses the only project", () => {
  const cta = fieldPendingEmptyObraCta({
    projectId: undefined,
    projects: [a],
    lastProjectId: null,
  });
  assert.equal(cta.href, "/proyectos/a");
  assert.equal(cta.label, "Volver a DEMO-001");
});

test("empty CTA uses last visited obra without calling it mi obra", () => {
  const cta = fieldPendingEmptyObraCta({
    projectId: undefined,
    projects: [a, b],
    lastProjectId: "a",
  });
  assert.equal(cta.href, "/proyectos/a");
  assert.equal(cta.label, "Ir a DEMO-001");
});

test("empty CTA falls back to the project list", () => {
  const cta = fieldPendingEmptyObraCta({
    projectId: undefined,
    projects: [a, b],
    lastProjectId: null,
  });
  assert.equal(cta.href, "/proyectos");
  assert.equal(cta.label, "Ver proyectos");
});
