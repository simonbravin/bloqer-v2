import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as domain from "@bloqer/domain";
import * as utils from "@bloqer/utils";
import * as validators from "@bloqer/validators";
import * as money from "../../../lib/format-money";

type Element = { type: unknown; props: Record<string, unknown> };
type ActionResult = { ok?: true; id?: string; error?: string; data?: unknown[]; total?: number };
type Action = (...args: unknown[]) => Promise<ActionResult>;
const jsx = (type: unknown, props: Record<string, unknown>): Element => ({ type, props });
const components = new Proxy({}, { get: (_, name) => String(name) });
function elements(tree: unknown, type: string): Element[] {
  if (Array.isArray(tree)) return tree.flatMap((node) => elements(node, type));
  if (!tree || typeof tree !== "object" || !("props" in tree)) return [];
  const node = tree as Element;
  return [...(node.type === type ? [node] : []), ...Object.values(node.props).flatMap((value) => elements(value, type))];
}
function load<T>(path: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}): T {
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  runInNewContext(compiled, { exports, ...globals, require(name: string) {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    if (name.startsWith("@/components/")) return components;
    assert.fail(`Unexpected dependency ${name}`);
  } });
  return exports as T;
}
class ServiceError extends Error { constructor(readonly code: string, message: string) { super(message); } }
function actionEnvironment(services: Record<string, unknown>) {
  const invalidated: string[] = [];
  const ctx = { actorUserId: "actor", tenantId: "tenant", companyId: "company", roles: ["OWNER"] };
  const dependencies: Record<string, unknown> = {
    "@bloqer/services": { ServiceError, ...services },
    "@bloqer/domain": domain,
    "@bloqer/validators": validators,
    "@/lib/auth": { getCurrentUser: async () => ({ session: { user: { id: "actor" } }, tenantCtx: ctx }) },
    "next/navigation": { redirect: () => assert.fail("Unexpected redirect") },
    "next/cache": { revalidatePath: (path: string) => invalidated.push(path) },
  };
  dependencies["@/lib/revalidate-project-paths"] = load("../../../lib/revalidate-project-paths.ts", dependencies);
  return { dependencies, invalidated, ctx };
}

for (const area of ["Sales", "Supplier"] as const) {
  const route = area === "Sales" ? "facturas" : "facturas-proveedor";
  const companyGetter = `getCompany${area}InvoiceById`;
  const referenceField = `referenced${area}InvoiceId`;
  const note = { id: "note", [referenceField]: "parent" };
  const actionsPath = `../../../app/(app)/finanzas/${route}/actions.ts`;

  test(`${area}: parent search uses only issued company invoices and keeps the serialized balance`, async () => {
    const env = actionEnvironment({
      [`listCompany${area}Invoices`]: async (ctx: unknown, filters: Record<string, unknown>) => {
        assert.deepEqual(JSON.parse(JSON.stringify(ctx)), env.ctx);
        assert.equal(filters.documentKind, "INVOICE");
        assert.equal(filters.status, "ISSUED");
        assert.equal(filters.page, 2);
        assert.equal(filters.pageSize, 10);
        assert.equal(filters.search, "FAC-123");
        return { data: [{ id: "parent", code: "FAC-123", clientName: "Cliente", supplierName: "Proveedor", currency: "USD", receivable: { balanceDue: "30.25" }, payable: { balanceDue: "30.25" } }], total: 11 };
      },
    });
    const actions = load<Record<string, Action>>(actionsPath, env.dependencies);
    const result = await actions[`listCompany${area}NoteParentsAction`]!("FAC-123", 2);
    assert.equal(result.total, 11);
    assert.deepEqual(JSON.parse(JSON.stringify(result.data)), [{ id: "parent", code: "FAC-123", contactName: area === "Sales" ? "Cliente" : "Proveedor", currency: "USD", balanceDue: "30.25" }]);
    assert.deepEqual(env.invalidated, []);
  });

  test(`${area}: corporate NC creation forwards the chosen partial amount and refreshes parent and note`, async () => {
    const calls: unknown[][] = [];
    const env = actionEnvironment({
      [companyGetter]: async (id: string) => { assert.equal(id, "parent"); return { id }; },
      [`create${area}CreditNoteFromInvoice`]: async (...args: unknown[]) => { calls.push(args); return note; },
    });
    const actions = load<Record<string, Action>>(actionsPath, env.dependencies);
    const result = await actions[`createCompany${area}CreditNoteFromInvoiceAction`]!("parent", { amount: "12.34" });
    assert.equal(result.id, "note");
    const input = calls[0]![0] as { lines: { unitPrice: string }[] };
    assert.equal(input.lines[0]!.unitPrice, "12.34");
    assert.deepEqual(JSON.parse(JSON.stringify(calls[0]![1])), env.ctx);
    for (const path of [`/finanzas/${route}/parent`, `/finanzas/${route}/note`, "/finanzas"]) assert.ok(env.invalidated.includes(path), path);
  });

  for (const operation of ["issue", "cancel"] as const) {
    test(`${area}: ${operation} NC enforces corporate scope and refreshes the affected parent balance`, async () => {
      const env = actionEnvironment({
        [companyGetter]: async () => note,
        [`${operation}${area}CreditNote`]: async (_id: string, _ctx: unknown, scope: unknown, reason?: string) => {
          assert.equal(scope, null);
          if (operation === "cancel") assert.equal(reason, "Duplicado");
          return note;
        },
      });
      const actions = load<Record<string, Action>>(actionsPath, env.dependencies);
      const result = await actions[`${operation}Company${area}CreditNoteAction`]!("note", "Duplicado");
      assert.equal(result.ok, true);
      for (const path of [`/finanzas/${route}/parent`, `/finanzas/${route}/note`]) assert.ok(env.invalidated.includes(path), path);
    });
  }

  test(`${area}: a project or foreign-company parent cannot reach corporate note creation`, async () => {
    let writes = 0;
    const env = actionEnvironment({
      [companyGetter]: async () => { throw new ServiceError("FORBIDDEN", "Empresa únicamente"); },
      [`create${area}CreditNoteFromInvoice`]: async () => { writes++; return note; },
    });
    const actions = load<Record<string, Action>>(actionsPath, env.dependencies);
    const result = await actions[`createCompany${area}CreditNoteFromInvoiceAction`]!("project-invoice", { amount: "10.00" });
    assert.equal(result.error, "Empresa únicamente");
    assert.equal(writes, 0);
    assert.deepEqual(env.invalidated, []);
  });

  test(`${area}: ND creates a referenced draft and emits it strictly in corporate scope`, async () => {
    const env = actionEnvironment({
      [companyGetter]: async () => note,
      [`create${area}DebitNoteFromInvoice`]: async (input: Record<string, unknown>) => {
        assert.equal(input[`parent${area}InvoiceId`], "parent");
        return note;
      },
      [`issue${area}DebitNote`]: async (id: string, _ctx: unknown, scope: unknown) => {
        assert.equal(id, "note");
        assert.equal(scope, null);
        return note;
      },
    });
    const actions = load<Record<string, Action>>(actionsPath, env.dependencies);
    assert.equal((await actions[`createCompany${area}DebitNoteFromInvoiceAction`]!("parent")).id, "note");
    assert.equal((await actions[`issueCompany${area}DebitNoteAction`]!("note")).ok, true);
    assert.ok(env.invalidated.includes(`/finanzas/${route}/parent`));
  });
}

function uiEnvironment() {
  const slots: unknown[] = [], effects: (() => void)[] = [], transitions: Promise<unknown>[] = [];
  const timers = new Map<number, () => void>(), navigation: string[] = [];
  let index = 0, timerId = 0;
  const react = {
    useState(initial: unknown) {
      const i = index++; if (!(i in slots)) slots[i] = initial;
      return [slots[i], (next: unknown) => { slots[i] = typeof next === "function" ? next(slots[i]) : next; }];
    },
    useRef(initial: unknown) { const i = index++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useId: () => `test-${index++}`,
    useCallback: (callback: unknown) => callback,
    useEffect(callback: () => (() => void) | void, deps: unknown[]) {
      const i = index++, old = slots[i] as { deps: unknown[]; cleanup?: () => void } | undefined;
      if (old && deps.every((value, position) => Object.is(value, old.deps[position]))) return;
      effects.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: callback() }; });
    },
    useTransition() {
      const [pending, setPending] = react.useState(false);
      return [pending, (callback: () => Promise<unknown>) => {
        (setPending as (next: boolean) => void)(true);
        transitions.push(Promise.resolve(callback()).finally(() => (setPending as (next: boolean) => void)(false)));
      }];
    },
  };
  const dependencies: Record<string, unknown> = {
    react, "@bloqer/domain": domain, "@bloqer/utils": utils, "@/lib/format-money": money,
    "next/navigation": { useRouter: () => ({ push: (href: string) => navigation.push(href) }) },
    sonner: { toast: { error() {} } },
  };
  dependencies["@/hooks/use-operational-action"] = load("../../../hooks/use-operational-action.ts", dependencies);
  const globals = {
    setTimeout: (callback: () => void) => { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout: (id: number) => timers.delete(id),
  };
  return {
    dependencies, globals, navigation,
    render<T>(component: () => T) { index = 0; const result = component(); for (const effect of effects.splice(0)) effect(); return result; },
    async flush() { for (const [id, callback] of timers) { timers.delete(id); callback(); } await setImmediate(); },
    async settle() { await Promise.all(transitions.splice(0)); },
  };
}

for (const scope of ["company-ar", "company-ap"] as const) {
  test(`${scope}: parent picker searches and selects the invoice before exposing note creation`, async () => {
    const env = uiEnvironment(), calls: unknown[][] = [];
    const list = async (...args: unknown[]) => { calls.push(args); return { data: [{ id: "parent", code: "FAC", contactName: "Contacto", currency: "USD", balanceDue: "30.25" }], total: 11 }; };
    env.dependencies["@/app/(app)/finanzas/facturas/actions"] = { listCompanySalesNoteParentsAction: scope === "company-ar" ? list : () => assert.fail("Wrong company scope") };
    env.dependencies["@/app/(app)/finanzas/facturas-proveedor/actions"] = { listCompanySupplierNoteParentsAction: scope === "company-ap" ? list : () => assert.fail("Wrong company scope") };
    env.dependencies["./create-fiscal-note-dialog"] = { CreateFiscalNoteDialog: "CreateFiscalNoteDialog" };
    const { NewCompanyFiscalNoteDialog } = load<{ NewCompanyFiscalNoteDialog: (props: unknown) => Element }>("../components/new-company-fiscal-note-dialog.tsx", env.dependencies, env.globals);
    const render = () => env.render(() => NewCompanyFiscalNoteDialog({ kind: "CREDIT_NOTE", scope }));
    assert.equal(render().props.parentInvoiceId, "");
    (render().props.onOpenChange as (next: boolean) => void)(true);
    render(); await env.flush();
    const next = elements(render().props.parentSelector, "Button").find((node) => node.props.children === "Siguiente")!;
    (next.props.onClick as () => void)();
    render(); await env.flush();
    (elements(render().props.parentSelector, "Input")[0]!.props.onChange as (event: unknown) => void)({ target: { value: "FAC" } });
    render(); await env.flush();
    assert.deepEqual(calls, [["", 1], ["", 2], ["FAC", 1]]);
    const candidate = elements(render().props.parentSelector, "Button")[0]!;
    (candidate.props.onClick as () => void)();
    const selected = render();
    assert.equal(selected.props.parentInvoiceId, "parent");
    assert.equal(selected.props.currency, "USD");
    assert.equal(selected.props.openBalance, "30.25");
    let prevented = false;
    (elements(selected.props.parentSelector, "Input")[0]!.props.onKeyDown as (event: unknown) => void)({ key: "Enter", preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
  });

  test(`${scope}: NC blocks missing parents and excess amounts, then sends a single partial application`, async () => {
    const env = uiEnvironment(), calls: unknown[][] = [];
    let finish!: (result: { id: string }) => void;
    const request = new Promise<{ id: string }>((resolve) => { finish = resolve; });
    const create = (...args: unknown[]) => { calls.push(args); return request; };
    for (const path of ["@/app/(app)/proyectos/[id]/facturas/actions", "@/app/(app)/proyectos/[id]/facturas-proveedor/actions"]) env.dependencies[path] = {};
    env.dependencies["@/app/(app)/finanzas/facturas/actions"] = { createCompanySalesCreditNoteFromInvoiceAction: create };
    env.dependencies["@/app/(app)/finanzas/facturas-proveedor/actions"] = { createCompanySupplierCreditNoteFromInvoiceAction: create };
    const { CreateFiscalNoteDialog } = load<{ CreateFiscalNoteDialog: (props: unknown) => Element }>("../components/create-fiscal-note-dialog.tsx", env.dependencies);
    const props = { kind: "CREDIT_NOTE", parentInvoiceId: "", parentCode: "FAC", currency: "ARS", openBalance: "30.25", scope: { type: scope } };
    const render = () => env.render(() => CreateFiscalNoteDialog(props));
    const submit = () => { (elements(render(), "form")[0]!.props.onSubmit as (event: unknown) => void)({ preventDefault() {} }); };
    (elements(render(), "Dialog")[0]!.props.onOpenChange as (next: boolean) => void)(true);
    submit(); assert.equal(calls.length, 0);
    props.parentInvoiceId = "parent"; render();
    const setAmount = (value: string) => { (elements(render(), "DecimalInput")[0]!.props.onValueChange as (value: string) => void)(value); };
    setAmount("30.26"); submit(); assert.equal(calls.length, 0);
    setAmount("12.34"); submit(); submit();
    assert.equal(calls.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), ["parent", { amount: "12.34" }]);
    assert.equal(elements(render(), "fieldset")[0]!.props.disabled, true);
    (elements(render(), "Dialog")[0]!.props.onOpenChange as (next: boolean) => void)(false);
    assert.equal(elements(render(), "Dialog")[0]!.props.open, true);
    finish({ id: "note" }); await env.settle();
    assert.deepEqual(env.navigation, [scope === "company-ap" ? "/finanzas/facturas-proveedor/note" : "/finanzas/facturas/note"]);
  });
}
