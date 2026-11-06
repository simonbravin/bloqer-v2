import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { compareDecimal, toIsoDateInTimeZone } from "@bloqer/utils";
import * as money from "@bloqer/utils";
import * as domain from "@bloqer/domain";
import * as variance from "@bloqer/services/purchase-variance-pure";
import * as formatMoney from "../../../lib/format-money";
import * as requestDrafts from "./purchase-request-form-lines";
import * as quoteEdit from "./quote-line-edit-values";

type Element = { type: string; props: Record<string, unknown>; key?: string | number };
const jsx = (type: string | ((props: Record<string, unknown>) => Element), props: Record<string, unknown>, key?: string | number): Element => typeof type === "function" ? type(props) : ({ type, props, key });
function elements(tree: unknown, type: string): Element[] {
  if (Array.isArray(tree)) return tree.flatMap((node) => elements(node, type));
  if (!tree || typeof tree !== "object" || !("props" in tree)) return [];
  const node = tree as Element;
  return [...(node.type === type ? [node] : []), ...Object.values(node.props).flatMap((value) => elements(value, type))];
}
function text(tree: unknown): string {
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join("");
  return tree && typeof tree === "object" && "props" in tree ? text((tree as Element).props.children) : "";
}
function load<T>(file: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}): T {
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  runInNewContext(code, { exports, URLSearchParams, ...globals, require(name: string) {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    if (name.startsWith("@/components/ui/")) return new Proxy({}, { get: (_, key) => String(key) });
    assert.fail(`Unexpected dependency: ${name}`);
  } });
  return exports as T;
}
function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function environment() {
  const slots: unknown[] = [], transitions: Promise<unknown>[] = [], errors: string[] = [];
  let index = 0;
  const react = {
    useState(initial: unknown) {
      const position = index++; if (!(position in slots)) slots[position] = typeof initial === "function" ? initial() : initial;
      return [slots[position], (next: unknown) => { slots[position] = typeof next === "function" ? next(slots[position]) : next; }];
    },
    useRef(initial: unknown) { const position = index++; if (!(position in slots)) slots[position] = { current: initial }; return slots[position]; },
    useMemo: (fn: () => unknown) => fn(), useCallback: (fn: unknown) => fn, useEffect() {},
    useTransition() {
      const [pending, setPending] = react.useState(false);
      return [pending, (action: () => Promise<unknown>) => {
        (setPending as (value: boolean) => void)(true);
        transitions.push(Promise.resolve(action()).finally(() => (setPending as (value: boolean) => void)(false)));
      }];
    },
  };
  const dependencies: Record<string, unknown> = {
    react,
    "@/components/ui/decimal-input": { DecimalInput: "DecimalInput", reportInvalidDecimalInputs: () => true },
    sonner: { toast: { error: (message: string) => errors.push(message), success() {}, warning() {} } },
    "next/navigation": { useRouter: () => ({ push() {}, replace() {}, refresh() {} }), usePathname: () => "/requests", useSearchParams: () => new URLSearchParams("create=1") },
  };
  const hook = load<{ useProcurementAction: (onPending?: (pending: boolean) => void) => { pending: boolean; run(action: () => Promise<unknown>): void; isRunning(): boolean } }>("./use-procurement-action.ts", dependencies);
  dependencies["../lib/use-procurement-action"] = hook;
  return { dependencies, hook, errors, render<T>(component: () => T) { index = 0; return component(); }, async settle() { await Promise.all(transitions.splice(0)); await setImmediate(); } };
}

test("procurement mutation locks before rerender, sanitizes network errors and allows retry", async () => {
  const env = environment(), request = deferred<void>(), pending: boolean[] = []; let writes = 0;
  const render = () => env.render(() => env.hook.useProcurementAction((value) => pending.push(value)));
  const first = render(); first.run(() => { writes++; return request.promise; }); first.run(async () => { writes++; });
  assert.equal(writes, 1); assert.equal(first.isRunning(), true); assert.equal(render().pending, true);
  request.reject(new Error("private transport details")); await env.settle();
  assert.equal(env.errors.length, 1); assert.ok(!env.errors[0]!.includes("private"));
  assert.deepEqual(pending, [true, false]); assert.equal(render().pending, false);
  render().run(async () => { writes++; }); await env.settle(); assert.equal(writes, 2);
});

for (const kind of ["order", "request"] as const) {
  test(`new ${kind} dialog cannot discard its draft while the child is saving`, () => {
    const env = environment();
    const dependencies = {
      ...env.dependencies, "next/link": {},
      "@/lib/media-query": { useHasMounted: () => true, useIsMdUp: () => true },
      "@/features/procurement/lib/procurement-form-layout": { PROCUREMENT_FORM_DIALOG_CLASS: "dialog" },
      "./purchase-order-form": { PurchaseOrderForm: "PurchaseOrderForm" },
      "./purchase-request-create-composer": { PurchaseRequestCreateComposer: "PurchaseRequestCreateComposer" },
    };
    const name = kind === "order" ? "NewPurchaseOrderDialog" : "NewPurchaseRequestDialog";
    const loaded = load<Record<string, (props: unknown) => Element>>(`../components/new-purchase-${kind}-dialog.tsx`, dependencies);
    const render = () => env.render(() => loaded[name]!({ projectId: "project", suppliers: [], wbsOptions: [], productOptions: [], defaultOpen: true }));
    const opened = render(), child = elements(opened, kind === "order" ? "PurchaseOrderForm" : "PurchaseRequestCreateComposer")[0]!;
    (child.props.onPendingChange as (pending: boolean) => void)(true);
    (opened.props.onOpenChange as (open: boolean) => void)(false);
    assert.equal(render().props.open, true);
    (child.props.onPendingChange as (pending: boolean) => void)(false);
    (render().props.onOpenChange as (open: boolean) => void)(false);
    assert.equal(render().props.open, false);
  });
}

test("receipt sends a positive over-receipt quantity to canonical tolerance validation and preserves it on rejection", async () => {
  const env = environment(), request = deferred<{ error: string }>(), payloads: Record<string, unknown>[] = [];
  const { ReceiptForm } = load<{ ReceiptForm: (props: unknown) => Element }>("../components/receipt-form.tsx", {
    ...env.dependencies,
    "@bloqer/utils": { toIsoDateInTimeZone },
    "@/app/(app)/proyectos/[id]/ordenes-compra/actions": { createPurchaseReceiptAction: (_project: string, payload: Record<string, unknown>) => { payloads.push(payload); return request.promise; } },
    "@/lib/format-money": { formatQtyFromString: (value: string) => value, isPositiveQty: (value: string) => value !== "" && compareDecimal(value, "0") > 0, compareQty: compareDecimal },
    "@/lib/use-idempotency-key": { useIdempotencyKey: () => ({ idempotencyKey: "receipt-attempt", rotateIdempotencyKey() {} }) },
    "@/features/procurement/lib/procurement-ui": { procurementActionBtnClass: "action" },
  }, { FormData: class { constructor(private form: { fields: Record<string, string> }) {} get(key: string) { return this.form.fields[key] ?? null; } } });
  const props = { projectId: "project", purchaseOrderId: "order", purchaseOrderCode: "OC-001", poLines: [{ id: "line", description: "Material", unit: "un", quantity: "1", receivedQuantity: "0", remainingQuantity: "1" }] };
  const render = () => env.render(() => ReceiptForm(props));
  const withoutWarehouses = render();
  assert.equal(elements(withoutWarehouses, "SelectTrigger").some((node) => node.props.id === "receipt-warehouse"), false);
  assert.ok(text(withoutWarehouses).includes("sin producto asociado no generan stock"));
  assert.ok(text(withoutWarehouses).includes("si no aparece ninguno, revisá Inventario o pedí acceso"));
  const [quantity, ...duplicates] = elements(withoutWarehouses, "DecimalInput");
  assert.ok(quantity);
  assert.equal(duplicates.length, 0, "The same input must carry the draft across responsive layouts");
  assert.equal(elements(withoutWarehouses, "Label").filter((node) => node.props.htmlFor === quantity.props.id).length, 1);
  assert.equal(quantity.props["aria-label"], "Cantidad recibida de Material");
  assert.equal(quantity.props.precision, 4);
  (quantity.props.onValueChange as (value: string) => void)("1.0525");
  const event = { preventDefault() {}, currentTarget: { fields: { receiptDate: "2026-11-04" } } };
  const submit = elements(render(), "form")[0]!.props.onSubmit as (event: unknown) => void;
  submit(event); submit(event); assert.equal(payloads.length, 1);
  assert.equal((payloads[0]!.lines as { quantityReceived: string }[])[0]!.quantityReceived, "1.0525");
  request.resolve({ error: "Cantidad fuera de la tolerancia permitida" }); await env.settle();
  assert.ok(text(render()).includes("Cantidad fuera de la tolerancia permitida"));
  assert.equal(elements(render(), "DecimalInput")[0]!.props.value, "1.0525");
});

test("request return keeps its reason and overlay when transport fails and blocks closing while pending", async () => {
  const env = environment(), request = deferred<void>(); let writes = 0;
  const { PurchaseRequestReturnActions } = load<{ PurchaseRequestReturnActions: (props: unknown) => Element }>("../components/purchase-request-return-actions.tsx", {
    ...env.dependencies,
    "@/app/(app)/proyectos/[id]/solicitudes-compra/actions": { returnPurchaseRequestAction: () => { writes++; return request.promise; } },
    "@/components/feedback/action-error-banner": { ActionErrorBanner: "ActionErrorBanner" },
    "../lib/procurement-ui": { procurementActionBtnClass: "action", procurementDialogBtnClass: "dialog" },
  });
  const render = () => env.render(() => PurchaseRequestReturnActions({ prId: "request", projectId: "project" }));
  const button = (tree: Element, id: string) => elements(tree, "Button").find((node) => node.props["data-testid"] === id)!;
  (button(render(), "purchase-request-return-button").props.onClick as () => void)();
  (elements(render(), "Textarea")[0]!.props.onChange as (event: unknown) => void)({ target: { value: "Conservar este motivo" } });
  const opened = render(), confirm = button(opened, "purchase-request-return-confirm").props.onClick as () => void;
  confirm(); confirm(); assert.equal(writes, 1);
  (elements(opened, "Sheet")[0]!.props.onOpenChange as (open: boolean) => void)(false);
  assert.equal(elements(render(), "Sheet")[0]!.props.open, true);
  request.reject(new Error("private")); await env.settle();
  assert.equal(elements(render(), "Textarea")[0]!.props.value, "Conservar este motivo");
  assert.equal(elements(render(), "Sheet")[0]!.props.open, true); assert.equal(env.errors.length, 1);
});

test("historical request header editing never serializes replacement lines", async () => {
  const env = environment(); let payload: Record<string, unknown> | undefined;
  const { PurchaseRequestForm } = load<{ PurchaseRequestForm: (props: unknown) => Element }>("../components/purchase-request-form.tsx", {
    ...env.dependencies, "lucide-react": { Trash2: "Trash2" },
    "@/lib/searchable-options": { SEARCHABLE_NONE: "none", wbsToSearchableOptions: () => [], toSearchableOptions: (value: unknown) => value, withNoneOption: (value: unknown) => value },
    "@/features/budgets/components/unit-select": { UnitSelect: "UnitSelect" }, "@/lib/budget-units": { budgetUnitLabel: (value: string) => value },
    "@/lib/format-money": formatMoney, "../lib/purchase-request-form-lines": requestDrafts,
    "../lib/procurement-ui": { procurementAmberCalloutClass: "warning" },
    "@/app/(app)/proyectos/[id]/solicitudes-compra/actions": { updatePurchaseRequestAction: async (_id: string, _project: string, data: Record<string, unknown>) => { payload = data; return { id: "request" }; } },
  }, { FormData: class { constructor(private form: { fields: Record<string, string> }) {} get(key: string) { return this.form.fields[key] ?? null; } } });
  const tree = env.render(() => PurchaseRequestForm({ mode: "edit", projectId: "project", purchaseRequestId: "request", readOnlyLines: true, wbsOptions: [], initialValues: { lines: [{ description: "Historical", quantity: "2", unit: "un" }] } }));
  const form = elements(tree, "form")[0]!;
  assert.equal(form.props.action, undefined);
  (form.props.onSubmit as (event: unknown) => void)({ preventDefault() {}, currentTarget: { fields: { notes: "Only header" } } });
  await env.settle();
  assert.equal(payload?.notes, "Only header"); assert.equal(Object.hasOwn(payload!, "lines"), false); assert.equal(Object.hasOwn(payload!, "neededByDate"), false);
});

test("APU selection replaces its quantity draft and copies its price only for a matching document currency", () => {
  for (const currency of ["ARS", "USD"]) {
    const env = environment(); let changed: { unitPrice: string; quantity: string }[] | undefined;
    const { PurchaseOrderLinesEditor } = load<{ PurchaseOrderLinesEditor: (props: unknown) => Element }>("../components/purchase-order-lines-editor.tsx", {
      ...env.dependencies, "@bloqer/utils": money, "@bloqer/domain": domain, "@bloqer/services/purchase-variance-pure": variance,
      "@/lib/format-money": formatMoney, "@/lib/searchable-options": { SEARCHABLE_NONE: "none", productsToSearchableOptions: () => [], toSearchableOptions: (value: unknown) => value, withNoneOption: (value: unknown) => value, wbsToSearchableOptions: () => [] },
      "@/features/budgets/components/unit-select": { UnitSelect: "UnitSelect" }, "@/lib/budget-units": { budgetUnitLabel: (value: string) => value },
      "@/features/finance/components/iibb-perception-fields": { DocumentTaxTotalsFooter: "DocumentTaxTotalsFooter" },
      "@/lib/cost-category-colors": { COST_CATEGORY_OPTIONS: [{ value: "MATERIAL", label: "Materiales" }] },
    }, { crypto: { randomUUID: () => "row" } });
    const render = () => env.render(() => PurchaseOrderLinesEditor({ currency, lines: changed ?? [{ wbsNodeId: "wbs", costType: "MATERIAL", productId: null, costAnalysisLineId: null, description: "Item", unit: "un", quantity: "2", unitPrice: "", taxRate: "21", discountPct: "0" }], onChange: (lines: typeof changed) => { changed = lines; }, wbsOptions: [{ id: "wbs", code: "1", name: "Item", budgetName: "Base", budgetCurrency: "USD", apuLines: [{ id: "apu", description: "APU", category: "MATERIAL", unit: "un", unitCost: "25.0000", quantity: "2" }] }] }));
    const tree = render();
    const apu = elements(tree, "SearchableCombobox").find((node) => String(node.props.id).endsWith("-apu"))!;
    (apu.props.onValueChange as (value: string) => void)("apu");
    assert.equal(changed?.[0]?.unitPrice, currency === "USD" ? "25.0000" : ""); assert.equal(changed?.[0]?.quantity, "2");
    const after = render();
    const decimal = (root: Element, suffix: string) => elements(root, "DecimalInput").find((node) => String(node.props.id).endsWith(suffix))!;
    assert.notEqual(decimal(after, "-quantity").key, decimal(tree, "-quantity").key);
    assert.equal(decimal(after, "-unit-price").key === decimal(tree, "-unit-price").key, currency !== "USD");
  }
});

test("reference and balance shortcuts replace only the decimal drafts they fill", () => {
  const env = environment();
  const discountScope = {};
  let invalidScope: object | null = null;
  let nextId = 0;
  const { PurchaseOrderLinesEditor } = load<{ PurchaseOrderLinesEditor: (props: unknown) => Element }>("../components/purchase-order-lines-editor.tsx", {
    ...env.dependencies, "@bloqer/utils": money, "@bloqer/domain": domain, "@bloqer/services/purchase-variance-pure": variance,
    "@/lib/format-money": formatMoney, "@/lib/searchable-options": { SEARCHABLE_NONE: "none", productsToSearchableOptions: () => [], toSearchableOptions: (value: unknown) => value, withNoneOption: (value: unknown) => value, wbsToSearchableOptions: () => [] },
    "@/features/budgets/components/unit-select": { UnitSelect: "UnitSelect" }, "@/lib/budget-units": { budgetUnitLabel: (value: string) => value },
    "@/features/finance/components/iibb-perception-fields": { DocumentTaxTotalsFooter: "DocumentTaxTotalsFooter" },
    "@/lib/cost-category-colors": { COST_CATEGORY_OPTIONS: [{ value: "MATERIAL", label: "Materiales" }] },
    "@/components/ui/decimal-input": { DecimalInput: "DecimalInput", reportInvalidDecimalInputs: (scope: object | null) => !invalidScope || scope !== invalidScope },
  }, { crypto: { randomUUID: () => `row-${nextId++}` } });
  const line = { wbsNodeId: "wbs", costType: "MATERIAL", productId: null, costAnalysisLineId: null, description: "Item", unit: "un", quantity: "2.0000", unitPrice: "25.0000", taxRate: "21", discountPct: "0" };
  let lines = [line, { ...line }];
  const render = () => env.render(() => PurchaseOrderLinesEditor({ currency: "ARS", lines, onChange: (value: typeof lines) => { lines = value; }, wbsOptions: [{ id: "wbs", code: "1", name: "Item", budgetName: "Base", budgetCurrency: "ARS", budgetUnitCost: "25.0000", availableSaldo: "50.00", unit: "un" }] }));
  const keys = (tree: Element) => elements(tree, "DecimalInput").filter((node) => /-(quantity|unit-price)$/.test(String(node.props.id))).map((node) => node.key);
  const shortcut = (tree: Element, title: string) => elements(tree, "button").find((node) => node.props.title === title)!;
  const before = render();
  (shortcut(before, "Usar este costo como precio unitario").props.onClick as () => void)();
  const priceFilled = render();
  assert.deepEqual(keys(priceFilled), [0, 1, 0, 0]);
  assert.equal(lines[0]!.unitPrice, line.unitPrice);

  const fillBalance = (tree: Element) => (shortcut(tree, "Ajustar la cantidad para consumir este saldo").props.onClick as (event: unknown) => void)({
    currentTarget: { closest: () => ({ querySelector: (selector: string) => selector.includes("discount") ? discountScope : null }) },
  });
  invalidScope = discountScope;
  fillBalance(priceFilled);
  assert.deepEqual(keys(render()), [0, 1, 0, 0]);
  invalidScope = null;
  fillBalance(render());
  assert.deepEqual(keys(render()), [1, 1, 0, 0]);
  assert.equal(lines[0]!.quantity, line.quantity);
});

test("foreign confirmation requires an explicit rate, preserves it and forwards it exactly once", async () => {
  const env = environment(), payloads: unknown[] = [];
  let validDecimal = true;
  const { ConfirmPurchaseOrderButton } = load<{ ConfirmPurchaseOrderButton: (props: unknown) => Element }>("../components/confirm-purchase-order-button.tsx", {
    ...env.dependencies, "@/features/finance/components/manual-fx-field": { ManualFxField: "ManualFxField" },
    "@/components/ui/decimal-input": { reportInvalidDecimalInputs: () => validDecimal },
    "@/app/(app)/proyectos/[id]/ordenes-compra/actions": { confirmPurchaseOrderAction: async (_id: string, _project: string, payload: unknown) => { payloads.push(payload); return { ok: true }; } },
  });
  const render = () => env.render(() => ConfirmPurchaseOrderButton({ poId: "order", projectId: "project", currency: "USD", initialFxRate: "" }));
  (elements(render(), "ConfirmAlertDialog")[0]!.props.onConfirm as () => void)(); await env.settle();
  assert.equal(payloads.length, 0); assert.ok(text(elements(render(), "ConfirmAlertDialog")[0]!.props.description).includes("Ingresá el tipo de cambio"));
  (elements(render(), "ManualFxField")[0]!.props.onValueChange as (value: string) => void)("1234.567890");
  validDecimal = false;
  (elements(render(), "ConfirmAlertDialog")[0]!.props.onConfirm as () => void)(); await env.settle();
  assert.equal(payloads.length, 0, "an invalid visible rate cannot send the previous canonical rate");
  validDecimal = true;
  const confirm = elements(render(), "ConfirmAlertDialog")[0]!.props.onConfirm as () => void;
  confirm(); confirm(); await env.settle();
  assert.equal(payloads.length, 1); assert.equal((payloads[0] as { fxRate: string }).fxRate, "1234.567890");
});

test("quote form labels each budget currency and updates only comparison notices when document currency changes", () => {
  const env = environment();
  const { PoLineBudgetRef } = load<{ PoLineBudgetRef: (props: Record<string, unknown>) => Element }>("../components/po-line-budget-ref.tsx", { "@/lib/format-money": formatMoney, "@/lib/budget-units": { budgetUnitLabel: (unit: string) => unit } });
  const { ProcurementQuoteForm } = load<{ ProcurementQuoteForm: (props: unknown) => Element }>("../components/procurement-quote-form.tsx", {
    ...env.dependencies, "@bloqer/utils": money, "@bloqer/domain": domain, "@/lib/format-money": formatMoney,
    "@/features/finance/components/manual-fx-field": { ManualFxField: "ManualFxField" }, "@/features/finance/components/invoice-letter-fields": { PricesIncludeTaxCheckbox: "PricesIncludeTaxCheckbox" }, "@/features/finance/components/iibb-perception-fields": { DocumentTaxTotalsFooter: "DocumentTaxTotalsFooter", IibbPerceptionFields: "IibbPerceptionFields" },
    "@/lib/searchable-options": { CONTACT_PICKER_SEARCH_PLACEHOLDER: "Supplier", toSearchableOptions: () => [] }, "../lib/quote-line-edit-values": quoteEdit, "./po-line-budget-ref": { PoLineBudgetRef }, "@/app/(app)/proyectos/[id]/solicitudes-compra/actions": {},
  });
  const props = { projectId: "project", purchaseRequestId: "request", suppliers: [], lines: ["USD", "ARS", null].map((budgetCurrency, index) => ({ id: `line-${index}`, description: `Item ${index}`, quantity: "1", unit: "un", budgetUnitCostSnapshot: `${index + 10}`, budgetCurrency })) };
  const render = () => env.render(() => ProcurementQuoteForm(props));
  const initial = render();
  assert.ok(text(initial).includes(`${formatMoney.formatUnitPriceFromString("10")} USD`));
  assert.ok(text(initial).includes("Referencia en USD y cotización en ARS: desvío no calculable"));
  assert.ok(text(initial).includes("Moneda de referencia no disponible"));
  (elements(initial, "CurrencySelect")[0]!.props.onValueChange as (value: string) => void)("USD");
  const changed = text(render());
  assert.ok(changed.includes("Referencia en ARS y cotización en USD: desvío no calculable"));
  assert.ok(!changed.includes("Referencia en USD y cotización en USD"));
  assert.ok(changed.includes(`${formatMoney.formatUnitPriceFromString("10")} USD`));
});

test("changed confirmation FX preserves canonical approval errors and the entered rate until the service accepts", async () => {
  const env = environment(), rejected = deferred<{ error: string }>(), payloads: { fxRate: string }[] = [];
  let refreshes = 0;
  const { ConfirmPurchaseOrderButton } = load<{ ConfirmPurchaseOrderButton: (props: unknown) => Element }>("../components/confirm-purchase-order-button.tsx", {
    ...env.dependencies, "next/navigation": { useRouter: () => ({ refresh: () => refreshes++ }) },
    "@/features/finance/components/manual-fx-field": { ManualFxField: "ManualFxField" },
    "@/app/(app)/proyectos/[id]/ordenes-compra/actions": { confirmPurchaseOrderAction: (_id: string, _project: string, payload: { fxRate: string }) => { payloads.push(payload); return payloads.length === 1 ? rejected.promise : Promise.resolve({ ok: true }); } },
  });
  const render = () => env.render(() => ConfirmPurchaseOrderButton({ poId: "order", projectId: "project", currency: "USD", initialFxRate: "1000.000000" }));
  (elements(render(), "Button")[0]!.props.onClick as () => void)();
  (elements(render(), "ManualFxField")[0]!.props.onValueChange as (value: string) => void)("2500.000000");
  const dialog = elements(render(), "ConfirmAlertDialog")[0]!;
  assert.ok(text(dialog.props.description).includes("Si cambiás el tipo de cambio aprobado, necesitás poder aprobar el nuevo importe"));
  (dialog.props.onConfirm as () => void)(); (dialog.props.onConfirm as () => void)();
  (dialog.props.onOpenChange as (open: boolean) => void)(false);
  assert.equal(payloads.length, 1); assert.equal(elements(render(), "ConfirmAlertDialog")[0]!.props.open, true);
  const message = "El nuevo importe requiere un aprobador habilitado. La OC permanece aprobada.";
  rejected.resolve({ error: message }); await env.settle();
  const failed = render();
  assert.equal(elements(failed, "ConfirmAlertDialog")[0]!.props.open, true);
  assert.ok(text(elements(failed, "ConfirmAlertDialog")[0]!.props.description).includes(message));
  assert.equal(elements(failed, "ManualFxField")[0]!.props.value, "2500.000000");
  assert.equal(refreshes, 0); assert.equal(env.errors.length, 0);
  (elements(failed, "ManualFxField")[0]!.props.onValueChange as (value: string) => void)("2750.000000");
  (elements(render(), "ConfirmAlertDialog")[0]!.props.onConfirm as () => void)(); await env.settle();
  assert.deepEqual(payloads.map((payload) => payload.fxRate), ["2500.000000", "2750.000000"]);
  assert.equal(elements(render(), "ConfirmAlertDialog")[0]!.props.open, false); assert.equal(refreshes, 1);
});
