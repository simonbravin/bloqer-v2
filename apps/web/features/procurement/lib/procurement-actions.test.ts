import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

type Action = (...args: unknown[]) => Promise<Record<string, unknown>>;
function load(file: string, dependencies: Record<string, unknown>): Record<string, Action> {
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  runInNewContext(code, { exports, require(name: string) {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
    return dependencies[name];
  } });
  return exports as Record<string, Action>;
}

function environment(options: { requestProject?: string; quoteIds?: string[]; denied?: boolean; invalid?: boolean } = {}) {
  const writes: { operation: string; args: unknown[] }[] = [];
  const invalidated: [string, string | undefined][] = [];
  class ServiceError extends Error { constructor(public code: string, message: string) { super(message); } }
  const cache = { revalidatePath: (path: string, kind?: string) => invalidated.push([path, kind]) };
  const shared = load("../../../lib/revalidate-project-paths.ts", { "next/cache": cache });
  const invalidation = load("./revalidate-procurement-paths.ts", { "next/cache": cache, "@/lib/revalidate-project-paths": shared });
  const services = new Proxy({ ServiceError }, { get(target, name: string) {
    if (name === "ServiceError") return target.ServiceError;
    if (name === "getPurchaseRequestById") return async () => {
      if (options.denied) throw new ServiceError("FORBIDDEN", "Sin acceso a la solicitud");
      return { id: "request", projectId: options.requestProject ?? "project" };
    };
    if (name === "listProcurementQuotesForRequest") return async () => (options.quoteIds ?? ["quote"]).map((id) => ({ id }));
    if (name === "getPurchaseOrderById") return async () => ({ id: "order", projectId: "project" });
    if (name === "getPurchaseReceiptById") return async () => ({ id: "receipt", projectId: "project", purchaseOrderId: "order" });
    return async (...args: unknown[]) => {
      writes.push({ operation: name, args });
      return { id: "created", purchaseOrderId: "order", purchaseOrderIds: ["order"] };
    };
  } });
  const schema = { safeParse: (data: unknown) => options.invalid
    ? { success: false, error: { issues: [{ message: "Datos inválidos" }] } }
    : { success: true, data } };
  const validators = new Proxy({}, { get: () => schema });
  const dependencies = {
    "@bloqer/services": services,
    "@bloqer/validators": validators,
    "@/lib/auth": { getCurrentUser: async () => ({ session: { user: { id: "actor" } }, tenantCtx: { tenantId: "tenant", companyId: "company", roles: ["OWNER"] } }) },
    "next/navigation": { redirect() { throw new Error("Redirect"); } },
    "next/cache": cache,
    "@/features/procurement/lib/revalidate-procurement-paths": invalidation,
    "@/lib/revalidate-project-paths": shared,
  };
  const requests = load("../../../app/(app)/proyectos/[id]/solicitudes-compra/actions.ts", dependencies);
  const orders = load("../../../app/(app)/proyectos/[id]/ordenes-compra/actions.ts", dependencies);
  return { requests, orders, writes, invalidated };
}

test("request creation rejects a different route project before writing or invalidating", async () => {
  const env = environment();
  const result = await env.requests.createPurchaseRequestAction("project", { projectId: "other" });
  assert.equal(typeof result.error, "string"); assert.equal(env.writes.length, 0); assert.equal(env.invalidated.length, 0);
});

test("request lifecycle actions bind the route project before calling their mutation", async () => {
  for (const action of ["submitPurchaseRequestAction", "cancelPurchaseRequestAction"]) {
    const env = environment({ requestProject: "other" });
    const result = await env.requests[action]!("request", "project");
    assert.equal(typeof result.error, "string"); assert.equal(env.writes.length, 0);
  }
});

test("quote create, edit, delete and batch award bind the parent request to the route", async () => {
  const calls: [string, unknown[]][] = [
    ["createProcurementQuoteAction", ["project", { purchaseRequestId: "request" }]],
    ["updateProcurementQuoteAction", ["project", "quote", "request", {}]],
    ["deleteProcurementQuoteAction", ["quote", "project", "request"]],
    ["createPurchaseOrdersFromAwardsAction", ["project", { purchaseRequestId: "request", groups: [] }]],
  ];
  for (const [name, args] of calls) {
    const env = environment({ requestProject: "other" });
    const result = await env.requests[name]!(...args);
    assert.equal(typeof result.error, "string"); assert.equal(env.writes.length, 0); assert.equal(env.invalidated.length, 0);
  }
});

test("quick award rejects a quote that does not belong to the bound request", async () => {
  const env = environment({ quoteIds: ["another-quote"] });
  const result = await env.requests.selectQuoteAndCreatePoAction("quote", "project", "request");
  assert.equal(result.error, "Cotización no encontrada"); assert.equal(env.writes.length, 0);
});

test("a denied parent request never reaches an award mutation", async () => {
  const env = environment({ denied: true });
  const result = await env.requests.selectQuoteAndCreatePoAction("quote", "project", "request");
  assert.equal(result.error, "Sin acceso a la solicitud"); assert.equal(env.writes.length, 0);
});

test("successful request submission refreshes the real request and all coverage consumers", async () => {
  const env = environment(); const result = await env.requests.submitPurchaseRequestAction("request", "project");
  assert.equal(result.ok, true); assert.equal(env.writes[0]?.operation, "submitPurchaseRequest");
  for (const suffix of ["solicitudes-compra", "materiales", "mano-obra", "equipos", "compras", "pendientes", "cronograma"]) {
    assert.ok(env.invalidated.some(([path]) => path === `/proyectos/project/${suffix}`), suffix);
  }
  assert.ok(env.invalidated.some(([path]) => path.endsWith("/solicitudes-compra/request")));
});

test("receipt confirmation refreshes parent orders and affected procurement detail pages", async () => {
  const env = environment(); const result = await env.orders.confirmPurchaseReceiptAction("receipt", "project", "order");
  assert.equal(result.ok, true);
  assert.ok(env.invalidated.some(([path]) => path === "/proyectos/project/recepciones/receipt"));
  assert.ok(env.invalidated.some(([path, kind]) => path === "/proyectos/project/solicitudes-compra/[prId]" && kind === "page"));
  assert.ok(env.invalidated.some(([path, kind]) => path === "/proyectos/project/ordenes-compra/[poId]" && kind === "page"));
});

test("invalid input does not perform writes or refresh unrelated paths", async () => {
  const env = environment({ invalid: true });
  assert.equal((await env.requests.createPurchaseRequestAction("project", {})).error, "Datos inválidos");
  assert.equal(env.writes.length, 0); assert.equal(env.invalidated.length, 0);
});

test("foreign-order confirmation forwards the explicit document FX through the canonical validator", async () => {
  const env = environment();
  const result = await env.orders.confirmPurchaseOrderAction("order", "project", { fxRate: "1234.567890" });
  assert.equal(result.ok, true);
  assert.equal(env.writes[0]!.operation, "confirmPurchaseOrder");
  assert.equal((env.writes[0]!.args[2] as { fxRate: string }).fxRate, "1234.567890");
});
