import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as utils from "@bloqer/utils";
import * as domain from "@bloqer/domain";
import * as money from "../../../lib/format-money";
import * as options from "../../../lib/searchable-options";

type Element = { type: unknown; props: Record<string, unknown> };
const jsx = (type: unknown, props: Record<string, unknown>): Element => ({ type, props });
function nodes(tree: unknown): Element[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object" || !("props" in tree)) return [];
  const node = tree as Element;
  return [node, ...Object.values(node.props).flatMap(nodes)];
}
const elements = (tree: unknown, type: string) => nodes(tree).filter((node) => node.type === type);
const components = new Proxy({}, { get: (_, name) => String(name) });
function load<T>(path: string, dependencies: Record<string, unknown>): T {
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  class Fields {
    constructor(private form: { fields: Record<string, unknown> }) {}
    get(name: string) { return this.form.fields[name] ?? null; }
  }
  runInNewContext(compiled, { exports, FormData: Fields, URLSearchParams, require(name: string) {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    if (name.startsWith("@/components/") || name.startsWith("@/features/")) return components;
    assert.fail(`Unexpected dependency ${name}`);
  } });
  return exports as T;
}
function deferred<T>() {
  let resolve!: (result: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function environment() {
  const slots: unknown[] = [], jobs: Promise<unknown>[] = [], navigation: string[] = [];
  let index = 0;
  const react = {
    useState(initial: unknown) {
      const i = index++;
      if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
      return [slots[i], (value: unknown) => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }];
    },
    useRef(initial: unknown) {
      const i = index++;
      if (!(i in slots)) slots[i] = { current: initial };
      return slots[i];
    },
    useMemo: (callback: () => unknown) => callback(),
    useCallback: (callback: unknown) => callback,
    useEffect() {},
    useTransition() {
      const [pending, setPending] = react.useState(false);
      return [pending, (callback: () => Promise<unknown>) => {
        (setPending as (value: boolean) => void)(true);
        jobs.push(Promise.resolve(callback()).finally(() => (setPending as (value: boolean) => void)(false)));
      }];
    },
  };
  const dependencies: Record<string, unknown> = {
    react,
    "@bloqer/utils": utils,
    "@bloqer/domain": domain,
    "@/lib/format-money": money,
    "@/lib/format": { formatDate: (value: unknown) => String(value) },
    "@/lib/searchable-options": options,
    "@/lib/utils": { cn: (...values: unknown[]) => values.filter(Boolean).join(" ") },
    "@/lib/use-idempotency-key": { useIdempotencyKey: () => ({ idempotencyKey: "stable-key", rotateIdempotencyKey() {} }) },
    "next/navigation": { useRouter: () => ({ push: (href: string) => navigation.push(href), refresh: () => navigation.push("refresh"), back: () => navigation.push("back") }) },
    sonner: { toast: { error() {}, warning() {}, success() {} } },
  };
  dependencies["@/hooks/use-operational-action"] = load("../../../hooks/use-operational-action.ts", dependencies);
  return { dependencies, navigation, render<T>(callback: () => T) { index = 0; return callback(); }, async settle() { await Promise.all(jobs.splice(0)); } };
}
function set(tree: unknown, component: string, value: string, occurrence = 0) {
  const node = elements(tree, component)[occurrence]!;
  assert.ok(node, `${component} must exist`);
  (node.props.onValueChange as (value: string) => void)(value);
}
function submit(tree: unknown, fields: Record<string, unknown> = {}) {
  (elements(tree, "form")[0]!.props.onSubmit as (event: unknown) => void)({ preventDefault() {}, currentTarget: { fields } });
}

for (const kind of ["payment", "collection"] as const) {
  test(`${kind}: a foreign-currency application keeps explicit FX and blocks a duplicate before rerender`, async () => {
    const env = environment(), request = deferred<{ id: string }>(), calls: unknown[][] = [], pending: boolean[] = [];
    const action = (...args: unknown[]) => { calls.push(args); return request.promise; };
    env.dependencies[kind === "payment" ? "@/app/(app)/proyectos/[id]/cuentas-por-pagar/actions" : "@/app/(app)/proyectos/[id]/cobranzas/actions"] = kind === "payment" ? { createPaymentAction: action } : { createCollectionAction: action };
    env.dependencies[kind === "payment" ? "@/app/(app)/finanzas/cuentas-por-pagar/actions" : "@/app/(app)/finanzas/cuentas-por-cobrar/actions"] = {};
    const loaded = load<Record<string, (props: Record<string, unknown>) => Element>>(kind === "payment" ? "../../ap/components/payment-form.tsx" : "../../collections/components/collection-form.tsx", env.dependencies);
    const Form = loaded[kind === "payment" ? "PaymentForm" : "CollectionForm"]!;
    const props = { projectId: "project", [`${kind === "payment" ? "payable" : "receivable"}Id`]: "obligation", [`${kind === "payment" ? "payable" : "receivable"}Balance`]: "100.00", [`${kind === "payment" ? "payable" : "receivable"}Currency`]: "USD", accounts: [{ id: "account", name: "USD", currency: "USD" }], onPendingChange: (value: boolean) => pending.push(value) };
    let tree = env.render(() => Form(props));
    set(tree, "Select", "account"); set(tree, "ManualFxField", "1200.123456");
    tree = env.render(() => Form(props));
    submit(tree, { amount: "25", paymentDate: "2026-11-05", collectionDate: "2026-11-05", reference: "REF" });
    submit(tree, { amount: "25" });
    assert.equal(calls.length, 1);
    assert.equal((calls[0]![1] as { fxRate: string }).fxRate, "1200.123456");
    assert.equal((calls[0]![1] as { amount: string }).amount, "25.00");
    assert.equal(elements(env.render(() => Form(props)), "fieldset")[0]!.props.disabled, true);
    request.reject(new Error("Connection lost")); await env.settle();
    tree = env.render(() => Form(props));
    assert.equal(elements(tree, "fieldset")[0]!.props.disabled, false);
    assert.equal(elements(tree, "DecimalInput")[0]!.props.value, "100.00");
    assert.ok(elements(tree, "p").some((node) => node.props.role === "alert"));
    assert.deepEqual(pending, [true, false]); assert.deepEqual(env.navigation, []);
  });
}

test("manual sale keeps qty/unit-price/discount capture at four decimals and survives transport failure", async () => {
  const env = environment(), request = deferred<{ id: string }>(), calls: unknown[][] = [];
  env.dependencies["@/app/(app)/proyectos/[id]/facturas/actions"] = { createSalesInvoiceAction: (...args: unknown[]) => { calls.push(args); return request.promise; } };
  const { ManualInvoiceForm } = load<{ ManualInvoiceForm: (props: Record<string, unknown>) => Element }>("../../sales-invoices/components/manual-invoice-form.tsx", env.dependencies);
  const props = { projectId: "project", clients: [{ id: "client", label: "Cliente" }] };
  let tree = env.render(() => ManualInvoiceForm(props));
  assert.ok(elements(tree, "DecimalInput").every((node) => node.props.precision === 4));
  set(tree, "SearchableCombobox", "client");
  tree = env.render(() => ManualInvoiceForm(props));
  const fields = { quantity: "0.1234", unitPrice: "3.3333", discountPct: "0.4567", description: "Venta", issueDate: "2026-11-05", dueDate: "2026-11-05" };
  submit(tree, fields); submit(tree, fields);
  assert.equal(calls.length, 1);
  const line = (calls[0]![1] as { lines: Record<string, string>[] }).lines[0]!;
  assert.equal(line.quantity, fields.quantity); assert.equal(line.unitPrice, fields.unitPrice); assert.equal(line.discountPct, fields.discountPct);
  request.reject(new Error("Offline")); await env.settle();
  assert.deepEqual(env.navigation, []);
  assert.equal(elements(env.render(() => ManualInvoiceForm(props)), "fieldset")[0]!.props.disabled, false);
});

test("Field obligation history distinguishes cancelled movements and noncash credits", () => {
  const env = environment();
  const { ReceivableFieldDetailView } = load<{ ReceivableFieldDetailView: (props: Record<string, unknown>) => Element }>("../../sales-invoices/components/receivable-field-detail-view.tsx", { ...env.dependencies, "next/link": { default: "Link" }, "./receivable-status-badge": { ReceivableStatusBadge: "ReceivableStatusBadge" } });
  const tree = ReceivableFieldDetailView({ clientName: "Cliente", invoiceCode: "FAC", issueDate: "2026-11-05", dueDate: "2026-11-05", currency: "USD", originalAmount: "100", paidAmount: "0", creditedAmount: "100", balanceDue: "0", status: "PAID", collections: [{ id: "old", status: "CANCELLED", collectionDate: "2026-11-05", amount: "100", currency: "USD", accountName: "USD" }] });
  const serialized = JSON.stringify(tree);
  assert.match(serialized, /Créditos NC \(sin caja\)/); assert.match(serialized, /Cancelada · sin efecto/);
});

test("aging summary renders separate currency groups instead of a mixed grand total", () => {
  const env = environment();
  const { AgingSummaryCards } = load<{ AgingSummaryCards: (props: Record<string, unknown>) => Element }>("../../aging/components/aging-summary-cards.tsx", env.dependencies);
  const totals = { current: "100", bucket1_30: "0", bucket31_60: "0", bucket61_90: "0", bucket90Plus: "0", totalOverdue: "0", totalBalance: "100" };
  const tree = AgingSummaryCards({ report: { totals: null, byCurrency: { ARS: totals, USD: { ...totals, totalBalance: "5" } } } });
  const groups = nodes(tree).filter((node) => typeof node.type === "function");
  assert.deepEqual(groups.map((node) => node.props.currency), ["ARS", "USD"]);
  assert.deepEqual(groups.map((node) => (node.props.totals as { totalBalance: string }).totalBalance), ["100", "5"]);
});

test("corporate receivable remains readable with Treasury disabled and does not load treasury accounts", async () => {
  const env = environment();
  const obligation = { id: "receivable", projectId: null, companyId: "company", salesInvoiceId: "invoice", salesInvoiceCode: "FAC", clientName: "Cliente", status: "OPEN", currency: "ARS", originalAmount: "100", paidAmount: "0", creditedAmount: "0", balanceDue: "100", issueDate: new Date("2026-11-05"), dueDate: new Date("2026-11-05") };
  const { default: Page } = load<{ default: (props: unknown) => Promise<Element> }>("../../../app/(app)/finanzas/cuentas-por-cobrar/[receivableId]/page.tsx", {
    ...env.dependencies,
    react: { Suspense: "Suspense" },
    "next/link": { default: "Link" },
    "next/headers": { cookies: async () => ({ get: () => undefined }) },
    "next/navigation": { redirect: () => assert.fail("Unexpected redirect"), notFound: () => assert.fail("Unexpected 404") },
    "@/lib/auth": { getCurrentUser: async () => ({ session: { user: { id: "actor" } }, tenantCtx: { tenantId: "tenant", companyId: "company", roles: ["OWNER"] } }) },
    "@/lib/viewport-hint-cookie": { parseViewportHint: () => null, isReceivablesFieldViewport: () => false },
    "@bloqer/config": { isStorageConfigured: () => false },
    "@bloqer/services": {
      getCompanyReceivableById: async () => obligation,
      listCollectionsByReceivable: async () => [],
      listEntityDocuments: async () => [],
      getTenantModuleGate: async () => ({ isEnabled: () => false }),
      listSelectableTreasuryAccounts: () => assert.fail("Treasury must not be queried"),
    },
    "../actions": { cancelCompanyReceivableAction: () => assert.fail("Reading cannot mutate"), cancelCompanyCollectionAction: () => assert.fail("Reading cannot mutate") },
  });
  const tree = await Page({ params: Promise.resolve({ receivableId: "receivable" }), searchParams: Promise.resolve({ cobrar: "1" }) });
  assert.match(JSON.stringify(tree), /Tesorería no está disponible/);
  assert.equal(elements(tree, "RegisterCompanyCollectionDialog").length, 0);
});
