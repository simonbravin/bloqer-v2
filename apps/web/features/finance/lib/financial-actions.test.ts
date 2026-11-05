import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as validators from "@bloqer/validators";

type Result = { ok?: true; id?: string; error?: string };
function load(path: string, dependencies: Record<string, unknown>) {
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  runInNewContext(compiled, { exports, require(name: string) {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`);
    return dependencies[name];
  } });
  return exports as Record<string, (...args: unknown[]) => Promise<Result>>;
}
class ServiceError extends Error { constructor(readonly code: string, message: string) { super(message); } }
const ids = { project: "11111111-1111-4111-8111-111111111111", obligation: "22222222-2222-4222-8222-222222222222", movement: "33333333-3333-4333-8333-333333333333", account: "44444444-4444-4444-8444-444444444444" };
function environment(services: Record<string, unknown>) {
  const invalidated: { path: string; type?: string }[] = [];
  const ctx = { actorUserId: "actor", tenantId: "tenant", companyId: "company", roles: ["OWNER"] };
  const dependencies: Record<string, unknown> = {
    "@bloqer/services": { ServiceError, ...services }, "@bloqer/validators": validators,
    "@/lib/auth": { getCurrentUser: async () => ({ session: { user: { id: "actor" } }, tenantCtx: ctx }) },
    "next/navigation": { redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } },
    "next/cache": { revalidatePath: (path: string, type?: string) => invalidated.push({ path, type }) },
  };
  dependencies["@/lib/revalidate-project-paths"] = load("../../../lib/revalidate-project-paths.ts", dependencies);
  return { dependencies, invalidated, ctx };
}

for (const domain of ["ar", "ap"] as const) {
  test(`project ${domain} cash cancellation forwards its reason and invalidates all dependent details without post-commit reads`, async () => {
    const calls: unknown[][] = [];
    const service = domain === "ar" ? "cancelCollection" : "cancelPayment";
    const env = environment({ [service]: async (...args: unknown[]) => { calls.push(args); return { projectId: ids.project }; } });
    const actions = load(domain === "ar" ? "../../../app/(app)/proyectos/[id]/cobranzas/actions.ts" : "../../../app/(app)/proyectos/[id]/cuentas-por-pagar/actions.ts", env.dependencies);
    const result = await actions[`${service}Action`]!(ids.movement, ids.project, "Duplicado");
    assert.equal(result.ok, true); assert.equal(calls.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), [ids.movement, env.ctx, ids.project, "Duplicado"]);
    for (const path of [`/proyectos/${ids.project}`, "/finanzas", "/tesoreria", "/contabilidad", "/reportes"]) {
      assert.ok(env.invalidated.some((entry) => entry.path === path && entry.type === "layout"), `Missing ${path}`);
    }
    assert.ok(!env.invalidated.some((entry) => entry.path === "/proyectos" || entry.path === "/"));
  });
}

for (const relationship of ["correct", "different-parent", "project-collection", "read-denied"] as const) {
  test(`corporate collection cancellation validates source/parent before mutation: ${relationship}`, async () => {
    const events: string[] = [];
    let committed = false;
    const env = environment({
      assertCompanyReceivableMutable: async () => { assert.equal(committed, false); events.push("parent"); if (relationship === "read-denied") throw new ServiceError("FORBIDDEN", "Denied"); },
      getCollectionById: async () => { assert.equal(committed, false); events.push("collection"); return { receivableId: relationship === "different-parent" ? "other" : ids.obligation, projectId: relationship === "project-collection" ? ids.project : null }; },
      cancelCollection: async (...args: unknown[]) => { committed = true; events.push("cancel"); assert.equal(args[3], "Duplicado"); },
    });
    const actions = load("../../../app/(app)/finanzas/cuentas-por-cobrar/actions.ts", env.dependencies);
    const result = await actions.cancelCompanyCollectionAction!(ids.obligation, ids.movement, "Duplicado");
    if (relationship === "correct") {
      assert.equal(result.ok, true); assert.deepEqual(events, ["parent", "collection", "cancel"]);
      assert.ok(env.invalidated.some((entry) => entry.path === "/finanzas" && entry.type === "layout"));
    } else { assert.ok(result.error); assert.equal(committed, false); assert.deepEqual(env.invalidated, []); }
  });
}

test("company payment action rejects a project source before creating cash", async () => {
  let writes = 0;
  const env = environment({ getCompanyPayableById: async () => { throw new ServiceError("FORBIDDEN", "Company only"); }, createPayment: async () => { writes++; } });
  const actions = load("../../../app/(app)/finanzas/cuentas-por-pagar/actions.ts", env.dependencies);
  const result = await actions.createCompanyPaymentAction!({ payableId: ids.obligation, accountId: ids.account, paymentDate: "2026-11-05", payFullBalance: true, idempotencyKey: "11111111-1111-4111-8111-111111111111" });
  assert.ok(result.error); assert.equal(writes, 0); assert.deepEqual(env.invalidated, []);
});

test("overhead preview retains closed periods without recalculating them", async () => {
  const preview = { period: "2026-11", calculationBlocked: true };
  let status = "FROZEN";
  let reads = 0;
  const env = environment({
    getOverheadPeriodCloseStatus: async () => status,
    getAutoWeightOverheadPreviewForPeriod: async () => { reads += 1; return preview; },
  });
  const actions = load("../../../app/(app)/finanzas/gastos-generales/actions.ts", env.dependencies);
  const input = { companyId: ids.project, period: preview.period };

  const closed = await actions.fetchAutoWeightPreviewAction!(input);
  assert.equal(closed.ok, true);
  assert.equal((closed as Result & { preview: unknown }).preview, null);
  assert.equal(reads, 0);

  status = "OPEN";
  const opened = await actions.fetchAutoWeightPreviewAction!(input);
  assert.equal(opened.ok, true);
  assert.equal((opened as Result & { preview: unknown }).preview, preview);
  assert.equal(reads, 1);
});
