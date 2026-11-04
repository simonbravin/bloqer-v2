import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as validators from "@bloqer/validators";

const projectId = "11111111-1111-4111-8111-111111111111";
const budgetId = "22222222-2222-4222-8222-222222222222";
const itemId = "33333333-3333-4333-8333-333333333333";
const lineId = "44444444-4444-4444-8444-444444444444";
const context = { tenantId: "tenant", actorUserId: "actor", companyId: "company", roles: ["OWNER"] };
class ServiceError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}
type Action = (...args: unknown[]) => Promise<unknown>;

function actions() {
  const calls: { name: string; args: unknown[] }[] = [];
  const invalidated: string[] = [];
  const derived: string[] = [];
  let signedIn = true;
  let failure: Error | null = null;
  const services: Record<string, unknown> = { ServiceError };
  for (const name of ["createBudget", "updateBudget", "submitBudgetForReview", "returnBudgetForChanges", "approveBudget", "closeBudget", "cancelBudget", "updateBudgetSettings", "addWbsNode", "updateWbsNode", "removeWbsNode", "reorderWbsNodes", "ensureWbsLeafForApu", "previewImport", "executeImport", "updateCostItem", "addCostAnalysisLine", "updateCostAnalysisLine", "removeCostAnalysisLine", "saveCostItemApu"]) {
    services[name] = async (...args: unknown[]) => {
      calls.push({ name, args });
      if (failure) throw failure;
      return { id: budgetId, createdNodes: 1, createdItems: 1 };
    };
  }
  const dependencies: Record<string, unknown> = {
    "@bloqer/services": services,
    "@bloqer/validators": validators,
    "@/lib/tenant-service-context": { buildTenantServiceContext: async () => signedIn ? context : null },
    "@/lib/revalidate-project-paths": { revalidateProjectCostAndFinancePaths: (id: string) => derived.push(id) },
    "next/navigation": { redirect: (path: string) => { throw new Error(`redirect:${path}`); } },
    "next/cache": { revalidatePath: (path: string) => invalidated.push(path) },
  };
  const code = ts.transpileModule(readFileSync(new URL("../../../app/(app)/proyectos/[id]/presupuestos/actions.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  runInNewContext(code, { exports, require: (name: string) => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected action dependency: ${name}`);
    return dependencies[name];
  } });
  return { exports: exports as Record<string, Action>, calls, invalidated, derived, fail: (error: Error) => { failure = error; }, signOut: () => { signedIn = false; } };
}

test("create budget binds the submitted project to the authorized page context and invalidates all consumers", async () => {
  const env = actions();
  const result = await env.exports.createBudgetAction!(projectId, { projectId: itemId, name: "Presupuesto" });
  assert.equal((result as { id: string }).id, budgetId);
  assert.equal((env.calls[0]!.args[0] as { projectId: string }).projectId, projectId);
  assert.equal(env.calls[0]!.args[1], context);
  assert.deepEqual(env.invalidated, [`/proyectos/${projectId}/presupuestos`, `/proyectos/${projectId}/presupuestos/${budgetId}`]);
  assert.deepEqual(env.derived, [projectId]);
});

const mutationCases: [string, unknown[]][] = [
  ["updateBudgetAction", [budgetId, projectId, { name: "Renombrado", internalNotes: "Notas" }]],
  ["updateBudgetSettingsAction", [budgetId, projectId, { overheadPct: 12.5 }]],
  ["submitForReviewAction", [budgetId, projectId, { comment: "Revisar" }]],
  ["returnForChangesAction", [budgetId, projectId, { comment: "Observaciones" }]],
  ["approveBudgetAction", [budgetId, projectId]],
  ["closeBudgetAction", [budgetId, projectId]],
  ["cancelBudgetAction", [budgetId, projectId]],
  ["ensureWbsLeafForApuAction", [budgetId, projectId, itemId]],
  ["addWbsNodeAction", [budgetId, projectId, { type: "ITEM", name: "Partida" }]],
  ["updateWbsNodeAction", [projectId, budgetId, itemId, { name: "Partida renombrada" }]],
  ["removeWbsNodeAction", [projectId, budgetId, itemId]],
  ["reorderWbsNodesAction", [budgetId, projectId, { parentId: null, orderedNodeIds: [itemId] }]],
  ["executeWbsImportAction", [budgetId, projectId, [{ code: "1", type: "ITEM", name: "Partida" }], { replaceExisting: false }]],
  ["updateCostItemAction", [projectId, budgetId, itemId, { quantity: 3, notes: null }]],
  ["addCostAnalysisLineAction", [projectId, budgetId, { costItemId: itemId, category: "MATERIAL", description: "Insumo", unit: "un", coefficient: 1, unitCost: 100 }]],
  ["updateCostAnalysisLineAction", [projectId, budgetId, lineId, { description: "Revisado" }]],
  ["removeCostAnalysisLineAction", [projectId, budgetId, lineId]],
  ["saveCostItemApuAction", [projectId, budgetId, { costItemId: itemId, quantity: 3, unit: "m2", notes: null, lines: [] }]],
];

for (const [name, args] of mutationCases) {
  test(`${name} refreshes budget totals, the detail and derived project views only after success`, async () => {
    const env = actions();
    const result = await env.exports[name]!(...args);
    assert.ok(!("error" in (result as object)));
    assert.equal(env.calls.length, 1);
    assert.ok(env.calls[0]!.args.includes(context));
    assert.ok(env.invalidated.includes(`/proyectos/${projectId}/presupuestos`));
    assert.ok(env.invalidated.includes(`/proyectos/${projectId}/presupuestos/${budgetId}`));
    assert.deepEqual(env.derived, [projectId]);
  });
}

test("actions return documented service errors without refreshing stale totals on failure", async () => {
  const env = actions();
  env.fail(new ServiceError("CONFLICT", "El presupuesto está en revisión"));
  const result = await env.exports.saveCostItemApuAction!(projectId, budgetId, { costItemId: itemId, lines: [] });
  assert.equal((result as { error: string }).error, "El presupuesto está en revisión");
  assert.equal(env.invalidated.length, 0);
  assert.equal(env.derived.length, 0);
});

test("invalid forms and malformed import envelopes do not reach services", async () => {
  const env = actions();
  for (const [name, args] of [
    ["createBudgetAction", [projectId, { projectId, name: "  " }]],
    ["returnForChangesAction", [budgetId, projectId, { comment: "  " }]],
    ["executeWbsImportAction", [budgetId, projectId, null, { replaceExisting: false }]],
    ["executeWbsImportAction", [budgetId, projectId, [{ code: "1", type: "ITEM", name: "Partida" }], null]],
  ] as [string, unknown[]][]) {
    assert.ok("error" in (await env.exports[name]!(...args) as object));
  }
  assert.equal(env.calls.length, 0);
  assert.equal(env.invalidated.length, 0);
});

test("unexpected errors are sanitized and a missing session redirects before mutating", async () => {
  const env = actions();
  env.fail(new Error("database connection secret"));
  const result = await env.exports.approveBudgetAction!(budgetId, projectId);
  assert.equal((result as { error: string }).error, "Error inesperado");
  env.signOut();
  await assert.rejects(env.exports.approveBudgetAction!(budgetId, projectId), /redirect:\/login/);
  assert.equal(env.calls.length, 1);
});
