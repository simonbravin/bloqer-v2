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

test("project nav Compras holds the full caminito: hub, SC, OC, Recepciones, Subcontratos", () => {
  const sections = buildProjectWorkspaceNavSections("proj-1", allOnGate, ["PROJECT_MANAGER"]);
  const compras = sections.find((s) => s.title === "Compras");
  assert.ok(compras);
  assert.deepEqual(
    compras!.items.map((i) => i.label),
    [
      "Tablero de compras",
      "Solicitudes de compra",
      "Órdenes de compra",
      "Recepciones",
      "Subcontratos",
    ],
  );
  assert.equal(compras!.items.find((i) => i.label === "Órdenes de compra")!.href, "/proyectos/proj-1/ordenes-compra");
  assert.equal(compras!.items.find((i) => i.label === "Subcontratos")!.href, "/proyectos/proj-1/subcontratos");
  assert.equal(sections.some((s) => s.title === "Compromisos"), false);
});

test("project nav does not place Recepciones, SC, OC or Subcontratos under Finanzas", () => {
  const sections = buildProjectWorkspaceNavSections("proj-1", allOnGate, ["PROJECT_MANAGER"]);
  const finanzas = sections.find((s) => s.title === "Finanzas del proyecto");
  assert.ok(finanzas);
  assert.equal(finanzas!.items.some((i) => i.label === "Recepciones"), false);
  assert.equal(finanzas!.items.some((i) => i.label === "Solicitudes de compra"), false);
  assert.equal(finanzas!.items.some((i) => i.label === "Órdenes de compra"), false);
  assert.equal(finanzas!.items.some((i) => i.label === "Subcontratos"), false);
});

test("project nav hides Compras when PROCUREMENT module is off (Subcontratos may remain alone)", () => {
  const gate: TenantModuleGate = {
    isEnabled: (m) => m !== "PROCUREMENT",
  };
  const sections = buildProjectWorkspaceNavSections("proj-1", gate, ["PROJECT_MANAGER"]);
  const compras = sections.find((s) => s.title === "Compras");
  assert.ok(compras);
  assert.equal(compras!.items.some((i) => i.label === "Órdenes de compra"), false);
  assert.ok(compras!.items.some((i) => i.label === "Subcontratos"));
  assert.equal(sections.some((s) => s.title === "Compromisos"), false);
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

test("project nav places Pendientes next to Resumen", () => {
  const sections = buildProjectWorkspaceNavSections("proj-1", allOnGate, ["PROJECT_MANAGER"]);
  const resumen = sections.find((s) => s.title === "Resumen");
  assert.ok(resumen);
  assert.deepEqual(
    resumen!.items.map((i) => i.label),
    ["Resumen", "Pendientes"],
  );
  assert.equal(resumen!.items[1]!.href, "/proyectos/proj-1/pendientes");
});
