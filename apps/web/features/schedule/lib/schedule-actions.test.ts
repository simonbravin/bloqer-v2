import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as validators from "@bloqer/validators";
import { ZodError } from "zod";

const projectId = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";
const linkId = "33333333-3333-4333-8333-333333333333";
const ctx = { actorUserId: "actor", tenantId: "tenant", companyId: "company", roles: ["OWNER"] };
class ServiceError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}
type Action = (...args: unknown[]) => Promise<Record<string, unknown>>;

function environment() {
  const calls: { name: string; args: unknown[] }[] = [];
  const paths: string[] = [];
  let allowed = true;
  let failure: Error | null = null;
  const services: Record<string, unknown> = { ServiceError };
  services.assertScheduleEntityProject = async (...args: unknown[]) => {
    calls.push({ name: "scope", args });
    if (!allowed) throw new ServiceError("FORBIDDEN", "La tarea no pertenece a esta obra.");
  };
  for (const name of ["linkWbsNodesToScheduleItem", "unlinkWbsNodeFromScheduleItem", "updateScheduleItemDates", "updateScheduleItemProgress", "moveScheduleItemToStatus", "copyScheduleProgressFromPhysical", "updateScheduleItemName", "cancelScheduleItem", "removeScheduleDependency", "addScheduleDependency", "importScheduleFromBudget", "createScheduleItem", "moveScheduleItem", "rollupScheduleContainersForProject", "listScheduleItemAuditHistory"]) {
    services[name] = async (...args: unknown[]) => {
      calls.push({ name, args });
      if (failure) throw failure;
      if (name === "listScheduleItemAuditHistory") return [];
      return { status: "IN_PROGRESS", fsWarnings: [], promotesLeafToContainer: false };
    };
  }
  const dependencies: Record<string, unknown> = {
    "@bloqer/services": services,
    "@bloqer/validators": validators,
    "zod": { ZodError },
    "next/cache": { revalidatePath: (path: string) => paths.push(path) },
    "next/navigation": { redirect: (path: string) => { throw new Error(`redirect:${path}`); } },
    "@/lib/auth": { getCurrentUser: async () => ({ session: { user: { id: ctx.actorUserId } }, tenantCtx: ctx }) },
  };
  const code = ts.transpileModule(readFileSync(new URL("../actions/schedule-actions.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  runInNewContext(code, { exports, require: (name: string) => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
    return dependencies[name];
  } });
  return { actions: exports as Record<string, Action>, calls, paths, deny: () => { allowed = false; }, fail: () => { failure = new Error("private connection details"); } };
}

const cases: [string, unknown[], Record<string, string>][] = [
  ["linkWbsNodesToScheduleItemAction", [projectId, itemId, { wbsNodeIds: [linkId] }], { scheduleItemId: itemId }],
  ["unlinkWbsNodeFromScheduleItemAction", [projectId, itemId, { wbsNodeId: linkId }], { scheduleItemId: itemId }],
  ["updateScheduleItemDatesAction", [projectId, itemId, { startDate: null, endDate: null }], { scheduleItemId: itemId }],
  ["updateScheduleItemProgressAction", [projectId, itemId, { progressPct: 45 }], { scheduleItemId: itemId }],
  ["moveScheduleItemStatusAction", [projectId, itemId, "IN_PROGRESS"], { scheduleItemId: itemId }],
  ["copyProgressFromPhysicalAction", [projectId, itemId, 40], { scheduleItemId: itemId }],
  ["updateScheduleItemNameAction", [projectId, itemId, { name: "Tarea" }], { scheduleItemId: itemId }],
  ["cancelScheduleItemAction", [projectId, itemId], { scheduleItemId: itemId }],
  ["removeScheduleDependencyAction", [projectId, { dependencyId: linkId }], { dependencyId: linkId }],
  ["addScheduleDependencyAction", [projectId, linkId, { predecessorId: itemId, successorId: linkId }], { scheduleId: linkId }],
];

for (const [name, args, entity] of cases) {
  test(`${name} binds the entity to its page project and refreshes its consumers`, async () => {
    const env = environment();
    assert.equal((await env.actions[name]!(...args)).ok, true);
    assert.equal(env.calls[0]!.name, "scope");
    assert.equal(env.calls[0]!.args[0], projectId);
    assert.deepEqual(JSON.parse(JSON.stringify(env.calls[0]!.args[1])), entity);
    for (const path of ["cronograma", "materiales", "mano-obra", "equipos", "control-costos", "reportes/avances"]) assert.ok(env.paths.includes(`/proyectos/${projectId}/${path}`));
    const denied = environment(); denied.deny();
    assert.match(String((await denied.actions[name]!(...args)).error), /no pertenece/);
    assert.equal(denied.calls.length, 1);
    assert.equal(denied.paths.length, 0);
  });
}

test("invalid schedule forms return useful errors without reaching persistence", async () => {
  const env = environment();
  for (const [name, args] of [
    ["createScheduleItemAction", [projectId, { name: " " }]],
    ["importScheduleFromBudgetAction", [projectId, { budgetId: "invalid" }]],
    ["updateScheduleItemDatesAction", [projectId, itemId, { startDate: "2026-02-30", endDate: null }]],
    ["moveScheduleItemStatusAction", [projectId, itemId, "UNKNOWN"]],
    ["moveScheduleItemStatusAction", [projectId, itemId, "BLOCKED", " "]],
    ["copyProgressFromPhysicalAction", [projectId, itemId, Number.POSITIVE_INFINITY]],
  ] as [string, unknown[]][]) assert.equal((await env.actions[name]!(...args)).error, "Revisá los datos del formulario.");
  assert.equal(env.calls.length, 0);
  assert.equal(env.paths.length, 0);
});

test("failed writes do not expose internals or invalidate views; history also binds its project", async () => {
  const env = environment(); env.fail();
  assert.equal((await env.actions.cancelScheduleItemAction!(projectId, itemId)).error, "Error inesperado");
  assert.equal(env.paths.length, 0);
  const history = environment(); history.deny();
  assert.match(String((await history.actions.listScheduleItemAuditAction!(projectId, itemId)).error), /no pertenece/);
  assert.equal(history.calls.length, 1);
});
