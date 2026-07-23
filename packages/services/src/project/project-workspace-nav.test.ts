import assert from "node:assert/strict";
import { test } from "node:test";
import { buildProjectWorkspaceNavSections } from "./project-workspace-nav";
import type { TenantModuleGate } from "../tenant-modules/tenant-module-gate";

const allOnGate: TenantModuleGate = {
  isEnabled: () => true,
};

test("project nav labels cost control as EDT y costos under Planificación", () => {
  const sections = buildProjectWorkspaceNavSections("proj-1", allOnGate, ["PROJECT_MANAGER"]);
  const planificacion = sections.find((s) => s.title === "Planificación");
  assert.ok(planificacion);
  const edt = planificacion!.items.find((i) => i.label === "EDT y costos");
  assert.ok(edt);
  assert.equal(edt!.href, "/proyectos/proj-1/control-costos");
});

test("project nav includes Recepciones under Operación for procurement viewers", () => {
  const sections = buildProjectWorkspaceNavSections("proj-1", allOnGate, ["PROJECT_MANAGER"]);
  const operacion = sections.find((s) => s.title === "Operación");
  assert.ok(operacion);
  const recepciones = operacion!.items.find((i) => i.label === "Recepciones");
  assert.ok(recepciones);
  assert.equal(recepciones!.href, "/proyectos/proj-1/recepciones");
});

test("project nav does not place Recepciones under Finanzas del proyecto", () => {
  const sections = buildProjectWorkspaceNavSections("proj-1", allOnGate, ["PROJECT_MANAGER"]);
  const finanzas = sections.find((s) => s.title === "Finanzas del proyecto");
  assert.ok(finanzas);
  assert.equal(
    finanzas!.items.some((i) => i.label === "Recepciones"),
    false,
  );
});

test("project nav hides Recepciones when PROCUREMENT module is off", () => {
  const gate: TenantModuleGate = {
    isEnabled: (m) => m !== "PROCUREMENT",
  };
  const sections = buildProjectWorkspaceNavSections("proj-1", gate, ["PROJECT_MANAGER"]);
  const operacion = sections.find((s) => s.title === "Operación");
  assert.equal(operacion?.items.some((i) => i.label === "Recepciones") ?? false, false);
});

test("project nav includes Consumos under Operación for inventory viewers", () => {
  const sections = buildProjectWorkspaceNavSections("proj-1", allOnGate, ["PROJECT_MANAGER"]);
  const operacion = sections.find((s) => s.title === "Operación");
  assert.ok(operacion);
  const consumos = operacion!.items.find((i) => i.label === "Consumos");
  assert.ok(consumos);
  assert.equal(consumos!.href, "/proyectos/proj-1/consumos");
});

test("project nav hides Consumos when INVENTORY module is off", () => {
  const gate: TenantModuleGate = {
    isEnabled: (m) => m !== "INVENTORY",
  };
  const sections = buildProjectWorkspaceNavSections("proj-1", gate, ["PROJECT_MANAGER"]);
  const operacion = sections.find((s) => s.title === "Operación");
  assert.equal(operacion?.items.some((i) => i.label === "Consumos") ?? false, false);
});
