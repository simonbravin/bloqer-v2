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

test("project nav includes Compras section with hub, SC, OC and Recepciones", () => {
  const sections = buildProjectWorkspaceNavSections("proj-1", allOnGate, ["PROJECT_MANAGER"]);
  const compras = sections.find((s) => s.title === "Compras");
  assert.ok(compras);
  assert.equal(
    compras!.items.find((i) => i.label === "Tablero de compras")!.href,
    "/proyectos/proj-1/compras",
  );
  assert.ok(compras!.items.some((i) => i.label === "Solicitudes de compra"));
  assert.ok(compras!.items.some((i) => i.label === "Órdenes de compra"));
  assert.ok(compras!.items.some((i) => i.label === "Recepciones"));
});

test("project nav does not place Recepciones or SC under Finanzas del proyecto", () => {
  const sections = buildProjectWorkspaceNavSections("proj-1", allOnGate, ["PROJECT_MANAGER"]);
  const finanzas = sections.find((s) => s.title === "Finanzas del proyecto");
  assert.ok(finanzas);
  assert.equal(finanzas!.items.some((i) => i.label === "Recepciones"), false);
  assert.equal(finanzas!.items.some((i) => i.label === "Solicitudes de compra"), false);
  assert.equal(finanzas!.items.some((i) => i.label === "Órdenes de compra"), false);
});

test("project nav hides Compras when PROCUREMENT module is off", () => {
  const gate: TenantModuleGate = {
    isEnabled: (m) => m !== "PROCUREMENT",
  };
  const sections = buildProjectWorkspaceNavSections("proj-1", gate, ["PROJECT_MANAGER"]);
  assert.equal(sections.some((s) => s.title === "Compras"), false);
});

test("project nav includes Materiales and Consumos under Operación", () => {
  const sections = buildProjectWorkspaceNavSections("proj-1", allOnGate, ["PROJECT_MANAGER"]);
  const operacion = sections.find((s) => s.title === "Operación");
  assert.ok(operacion);
  assert.equal(operacion!.items.find((i) => i.label === "Materiales")!.href, "/proyectos/proj-1/materiales");
  assert.equal(operacion!.items.find((i) => i.label === "Consumos")!.href, "/proyectos/proj-1/consumos");
});

test("project nav hides Consumos when INVENTORY module is off", () => {
  const gate: TenantModuleGate = {
    isEnabled: (m) => m !== "INVENTORY",
  };
  const sections = buildProjectWorkspaceNavSections("proj-1", gate, ["PROJECT_MANAGER"]);
  const operacion = sections.find((s) => s.title === "Operación");
  assert.equal(operacion?.items.some((i) => i.label === "Consumos") ?? false, false);
});
