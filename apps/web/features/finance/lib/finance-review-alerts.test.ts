import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

type Alert = { message: string; context?: string; sources?: { href: string; label: string }[] };

async function projectionAlerts(access: { canTreasury: boolean; canAp: boolean }, options: { cash?: string; negative?: boolean; warnings?: string[]; fail?: boolean } = {}) {
  const compiled = ts.transpileModule(readFileSync(new URL("../../../../../packages/services/src/finance/finance-corporate-kpis.service.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports: { buildFinanceProjection?: (...args: unknown[]) => Promise<unknown> } = {};
  runInNewContext(compiled, { exports, require(name: string) {
    if (name === "@bloqer/database") return { Prisma: { Decimal: class {
      constructor(private value: string) {}
      lessThan(limit: number) { return Number(this.value) < limit; }
    } } };
    if (name === "../dashboard/kpi-helpers") return { fmtDecimalEs: (value: string) => value };
    if (name === "../reports/company-cash-projection.service") return { getCompanyCashProjectionReport: async () => {
      if (options.fail) throw new Error("unavailable");
      return { dateFrom: "2026-11-27", dateTo: "2027-02-25", warnings: options.warnings ?? [], rows: [{
        currency: "USD", cashBalance: options.cash ?? "100.00", expectedOutflows90d: "300.00",
        projectedBalance: "-200.00", isNegative: options.negative ?? true, openPayableCount: 2,
      }] };
    } };
    // Other imports belong to KPI paths not exercised by the projection adapter.
    return {};
  } });
  const alerts: Alert[] = [];
  const result = await exports.buildFinanceProjection!({}, access, null, alerts);
  return { result, alerts };
}

test("projection warning identifies its scope, dates and existing sources", async () => {
  const { alerts } = await projectionAlerts({ canTreasury: true, canAp: true });
  const warning = alerts.find((a) => a.message.startsWith("Saldo proyectado"))!;
  assert.deepEqual(Array.from(warning.sources!, (s) => s.href), ["/tesoreria/cuentas", "/finanzas/cuentas-por-pagar"]);
  assert.match(warning.context!, /2026-11-27 a 2027-02-25/);
  assert.match(warning.context!, /no incluye cobranzas futuras ni obligaciones de obras/);
});

test("unavailable treasury is explicit and does not offer a treasury source", async () => {
  const { alerts } = await projectionAlerts({ canTreasury: false, canAp: true }, {
    warnings: ["Tesorería no disponible: saldo de caja en cero para la proyección."], cash: "0.00",
  });
  const warning = alerts.find((a) => a.message.startsWith("Proyección parcial"))!;
  assert.ok(warning);
  assert.match(warning.context!, /Tesorería no disponible/);
  assert.deepEqual(Array.from(warning.sources!, (s) => s.href), ["/finanzas/cuentas-por-pagar"]);
  assert.ok(alerts.some((a) => a.message.includes("Tesorería no disponible")));
});

test("unavailable AP keeps account review but does not offer an AP source", async () => {
  const { alerts } = await projectionAlerts({ canTreasury: true, canAp: false }, {
    cash: "-100.00", warnings: ["AP no disponible: egresos esperados en cero."],
  });
  const cash = alerts.find((a) => a.message.startsWith("Saldo de caja"))!;
  const projection = alerts.find((a) => a.message.startsWith("Proyección parcial"))!;
  for (const alert of [cash, projection]) {
    assert.deepEqual(Array.from(alert.sources!, (s) => s.href), ["/tesoreria/cuentas"]);
  }
});

test("no financial access and unavailable reports do not invent review evidence", async () => {
  const denied = await projectionAlerts({ canTreasury: false, canAp: false });
  assert.equal(denied.result, null);
  assert.equal(denied.alerts.length, 0);
  const failed = await projectionAlerts({ canTreasury: true, canAp: true }, { fail: true });
  assert.equal(failed.result, null);
  assert.equal(failed.alerts.length, 1);
  assert.equal(failed.alerts[0].sources, undefined);
  assert.match(failed.alerts[0].message, /No se pudo calcular/);
});

test("a nonnegative report does not add negative-balance warnings", async () => {
  const { alerts } = await projectionAlerts({ canTreasury: true, canAp: true }, { negative: false });
  assert.equal(alerts.length, 0);
});

test("shared alert presentation retains evidence and source actions, including source-free notices", () => {
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  const compiled = ts.transpileModule(readFileSync(new URL("../components/finance-review-alerts.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports: { FinanceReviewAlerts?: (props: { alerts: unknown[] }) => unknown } = {};
  runInNewContext(compiled, { exports, require(name: string) {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (name === "next/link") return { default: "Link" };
    if (name === "@/components/ui/button") return { Button: "Button" };
    assert.fail(`Unexpected dependency ${name}`);
  } });
  const tree = exports.FinanceReviewAlerts!({ alerts: [
    { variant: "warning", message: "Proyección parcial", context: "Tesorería no disponible", sources: [{ label: "Revisar obligaciones corporativas", href: "/finanzas/cuentas-por-pagar" }] },
    { variant: "info", message: "No se pudo cargar el detalle" },
  ] });
  const nodes: { type: unknown; props: Record<string, unknown> }[] = [];
  function walk(value: unknown) {
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (!value || typeof value !== "object" || !("props" in value)) return;
    const node = value as typeof nodes[number]; nodes.push(node); Object.values(node.props).forEach(walk);
  }
  walk(tree);
  assert.equal(nodes.filter((n) => n.props.role === "note").length, 2);
  assert.ok(nodes.some((n) => n.props.children === "Tesorería no disponible"));
  const links = nodes.filter((n) => n.type === "Link");
  assert.equal(links.length, 1);
  assert.equal(links[0].props.href, "/finanzas/cuentas-por-pagar");
  assert.ok(nodes.filter((n) => n.type === "Button").every((n) => String(n.props.className).includes("min-h-11")));
  assert.equal(exports.FinanceReviewAlerts!({ alerts: [] }), null);
});
