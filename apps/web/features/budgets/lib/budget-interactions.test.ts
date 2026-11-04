import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as domain from "@bloqer/domain";
import * as money from "@bloqer/utils";
import * as validators from "@bloqer/validators";
import * as apuDetails from "./wbs-apu-detail";
import * as apuMoney from "./apu-money";
import { computeApuUnitContribution } from "@bloqer/services/budget-apu-calc";
import * as wbsMetrics from "@bloqer/services/wbs-metrics";
import * as wbsCodes from "./wbs-codes";
import * as wbsApu from "./wbs-apu";
import type { WbsViewNode } from "@bloqer/services";

type Element = { type: string; props: Record<string, unknown> };
const jsx = (type: string, props: Record<string, unknown>): Element => ({ type, props });
function elements(tree: unknown, type: string): Element[] {
  if (Array.isArray(tree)) return tree.flatMap((node) => elements(node, type));
  if (!tree || typeof tree !== "object" || !("props" in tree)) return [];
  const node = tree as Element;
  return [...(node.type === type ? [node] : []), ...Object.values(node.props).flatMap((prop) => elements(prop, type))];
}
function text(tree: unknown): string {
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join("");
  if (!tree || typeof tree !== "object" || !("props" in tree)) return "";
  return text((tree as Element).props.children);
}
function button(tree: unknown, label: string): Element {
  const node = elements(tree, "button").find((item) => text(item).trim() === label);
  assert.ok(node, `Missing button: ${label}`);
  return node;
}
function click(node: Element) { (node.props.onClick as () => void)(); }
function change(node: Element, value: string) {
  (node.props.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
}
function loadModule<T>(filename: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}): T {
  const source = ts.transpileModule(readFileSync(new URL(filename, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  runInNewContext(source, {
    exports, URLSearchParams, ...globals,
    crypto: { randomUUID: () => "temporary-line" },
    window: { confirm: () => true }, confirm: () => true,
    require: (name: string) => {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
      assert.ok(Object.hasOwn(dependencies, name), `Unmocked interaction dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports as T;
}

/** Real component callbacks/hooks with controlled renders; scheduling and DOM are covered by browser smoke. */
function hooks() {
  const slots: unknown[] = [];
  const transitions: Promise<unknown>[] = [];
  let index = 0;
  let effects: (() => void)[] = [];
  const react = {
    useState(initial: unknown) {
      const position = index++;
      if (!(position in slots)) slots[position] = typeof initial === "function" ? initial() : initial;
      return [slots[position], (next: unknown) => {
        slots[position] = typeof next === "function" ? next(slots[position]) : next;
      }];
    },
    useRef(initial: unknown) {
      const position = index++;
      if (!(position in slots)) slots[position] = { current: initial };
      return slots[position];
    },
    useMemo: (callback: () => unknown) => callback(),
    useCallback: (callback: unknown) => callback,
    useId: () => "budget-interaction",
    useEffect(callback: () => void | (() => void), deps: unknown[]) {
      const position = index++;
      const previous = slots[position] as { deps: unknown[]; cleanup?: () => void } | undefined;
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
        effects.push(() => { previous?.cleanup?.(); slots[position] = { deps, cleanup: callback() }; });
      }
    },
    useTransition() {
      const [pending, setPending] = react.useState(false);
      return [pending, (action: () => Promise<unknown>) => {
        (setPending as (value: boolean) => void)(true);
        transitions.push(Promise.resolve(action()).finally(() => (setPending as (value: boolean) => void)(false)));
      }];
    },
  };
  return {
    react,
    render<T>(component: () => T): T {
      index = 0;
      const tree = component();
      const nextEffects = effects;
      effects = [];
      nextEffects.forEach((effect) => effect());
      return tree;
    },
    async settle() { await Promise.all(transitions.splice(0)); await setImmediate(); },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const ui = {
  "@/components/ui/button": { Button: "button" },
  "@/components/ui/input": { Input: "input" },
  "@/components/ui/label": { Label: "label" },
  "@/components/ui/textarea": { Textarea: "textarea" },
  "@/components/ui/badge": { Badge: "badge" },
  "@/components/ui/separator": { Separator: "separator" },
  "@/components/ui/currency-select": { CurrencySelect: "currency-select" },
  "@/components/ui/decimal-input": { DecimalInput: "decimal-input", bindRhfNumberDecimal: (value: unknown, onValueChange: unknown) => ({ value, onValueChange }) },
  "@/components/ui/dialog": Object.fromEntries(["Dialog", "DialogContent", "DialogTitle", "DialogTrigger", "DialogHeader", "DialogDescription", "DialogFooter"].map((name) => [name, name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()])),
  "@/components/ui/select": Object.fromEntries(["Select", "SelectContent", "SelectItem", "SelectTrigger", "SelectValue"].map((name) => [name, name.toLowerCase()])),
  "@/components/ui/table": Object.fromEntries(["Table", "TableBody", "TableCell", "TableHead", "TableHeader", "TableRow"].map((name) => [name, name.toLowerCase()])),
  "lucide-react": { Pencil: "icon", Plus: "icon", Trash2: "icon", Upload: "icon" },
};
function environment() {
  const harness = hooks();
  const errors: string[] = [];
  const successes: string[] = [];
  const pushed: string[] = [];
  let refreshes = 0;
  const action = loadModule<Record<string, unknown>>("./use-budget-action.ts", { react: harness.react });
  const dependencies = {
    ...ui, react: harness.react,
    "../lib/use-budget-action": action,
    "next/navigation": { useRouter: () => ({ push: (path: string) => pushed.push(path), refresh: () => { refreshes++; }, back() {} }) },
    sonner: { toast: { error: (message: string) => errors.push(message), success: (message: string) => successes.push(message), info: (message: string) => errors.push(message) } },
  };
  return { ...harness, action, dependencies, errors, successes, pushed, refreshes: () => refreshes };
}

test("budget action locks synchronously, sanitizes a rejected request and allows retry", async () => {
  const env = environment();
  const changes: boolean[] = [];
  const useBudgetAction = env.action.useBudgetAction as (onError: (message: string) => void, onPendingChange: (value: boolean) => void) => { isPending: boolean; run: (callback: () => Promise<unknown>) => Promise<void> };
  const render = () => env.render(() => useBudgetAction((message) => env.errors.push(message), (value) => changes.push(value)));
  const request = deferred<void>();
  let calls = 0;
  const interaction = render();
  const first = interaction.run(() => { calls++; return request.promise; });
  await interaction.run(() => { calls++; return Promise.resolve(); });
  assert.equal(calls, 1);
  assert.equal(render().isPending, true);
  request.reject(new Error("private backend details"));
  await first;
  assert.equal(render().isPending, false);
  assert.equal(env.errors[0], "No se pudo completar la acción. Volvé a intentar.");
  await render().run(async () => { calls++; });
  assert.equal(calls, 2);
  assert.deepEqual(changes, [true, false, true, false]);
});

function lifecycle(status: string, canEdit: boolean, canApprove: boolean) {
  const env = environment();
  const mutations: { kind: string; payload: unknown; request: ReturnType<typeof deferred<unknown>> }[] = [];
  const action = (kind: string) => (payload: unknown) => { const request = deferred<unknown>(); mutations.push({ kind, payload, request }); return request.promise; };
  const { BudgetLifecycleDialog } = loadModule<{ BudgetLifecycleDialog: (props: unknown) => Element }>("../components/budget-lifecycle-dialog.tsx", {
    ...env.dependencies,
    "./budget-status-badge": { BudgetStatusBadge: "status" },
    "@/lib/format": { formatDateTime: String },
  });
  const render = () => env.render(() => BudgetLifecycleDialog({ status, canEdit, canApprove, lifecycleLog: [], onSubmitForReview: action("submit"), onReturnForChanges: action("return"), onApprove: action("approve"), onClose: action("close"), onCancel: action("cancel") }));
  (render().props.onOpenChange as (open: boolean) => void)(true);
  return { ...env, mutations, render };
}

test("budget lifecycle exposes the permitted transitions for readers, editors and approvers", () => {
  for (const status of ["DRAFT", "IN_REVIEW", "RETURNED_FOR_CHANGES", "APPROVED"]) {
    const readOnly = lifecycle(status, false, false).render();
    assert.equal(elements(readOnly, "button").length, 1, `${status}: only the history trigger remains`);
  }
  const review = lifecycle("IN_REVIEW", true, false).render();
  assert.ok(!text(review).includes("Aprobar presupuesto"));
  assert.ok(text(review).includes("Devolver con observaciones"));
  assert.ok(text(review).includes("Cancelar presupuesto"));
  const approved = lifecycle("APPROVED", true, true).render();
  assert.ok(text(approved).includes("Cerrar presupuesto"));
  assert.ok(!text(approved).includes("Cancelar presupuesto"));
});

test("budget lifecycle keeps the comment after failure and blocks duplicate confirmation and dismissal", async () => {
  const env = lifecycle("IN_REVIEW", true, true);
  click(button(env.render(), "Devolver con observaciones"));
  change(elements(env.render(), "textarea")[0]!, "Revisar rendimientos");
  const tree = env.render();
  const confirm = button(tree, "Confirmar");
  click(confirm);
  click(confirm);
  (tree.props.onOpenChange as (open: boolean) => void)(false);
  assert.equal(env.mutations.length, 1);
  assert.equal(env.render().props.open, true);
  assert.equal(elements(env.render(), "dialog-content")[0]!.props.closeButtonDisabled, true);
  env.mutations[0]!.request.reject(new Error("private error"));
  await env.settle();
  assert.ok(text(env.render()).includes("Volvé a intentar"));
  assert.equal(elements(env.render(), "textarea")[0]!.props.value, "Revisar rendimientos");
  click(button(env.render(), "Confirmar"));
  assert.equal(env.mutations.length, 2);
  assert.equal((env.mutations[1]!.payload as { comment: string }).comment, "Revisar rendimientos");
  env.mutations[1]!.request.resolve({ ok: true });
  await env.settle();
  assert.equal(env.render().props.open, false);
  assert.equal(env.refreshes(), 1);
});

function budgetForm() {
  const env = environment();
  const creations: ReturnType<typeof deferred<unknown>>[] = [];
  const imports: { budgetId: string; request: ReturnType<typeof deferred<unknown>> }[] = [];
  const values: Record<string, unknown> = {};
  let initialized = false;
  const form = {
    register: (name: string) => ({ name }),
    watch: (name?: string) => name ? values[name] : values,
    getValues: (name: string) => values[name],
    setValue: (name: string, value: unknown) => { values[name] = value; },
    formState: { errors: {} },
    handleSubmit: (callback: (data: Record<string, unknown>) => void) => () => callback({ ...values }),
  };
  const { BudgetForm } = loadModule<{ BudgetForm: (props: unknown) => Element }>("../components/budget-form.tsx", {
    ...env.dependencies, "@bloqer/validators": validators,
    "react-hook-form": { useForm: (options: { defaultValues: Record<string, unknown> }) => { if (!initialized) { Object.assign(values, options.defaultValues, { name: "Presupuesto" }); initialized = true; } return form; } },
    "@hookform/resolvers/zod": { zodResolver() {} },
    "./budget-wbs-preload-section": { BudgetWbsPreloadSection: "budget-preload" },
  });
  const render = () => env.render(() => BudgetForm({ projectId: "project", onSubmit: () => { const request = deferred<unknown>(); creations.push(request); return request.promise; }, onImportWbs: (budgetId: string) => { const request = deferred<unknown>(); imports.push({ budgetId, request }); return request.promise; } }));
  function submit() { (render().props.onSubmit as () => void)(); }
  return { ...env, render, submit, creations, imports };
}

test("creating and importing can retry a failed import without creating a second budget", async () => {
  const env = budgetForm();
  const preload = elements(env.render(), "budget-preload")[0]!;
  (preload.props.onPendingRowsChange as (rows: unknown[]) => void)([{ code: "1", name: "Partida", type: "ITEM" }]);
  env.submit();
  env.submit();
  assert.equal(env.creations.length, 1);
  env.creations[0]!.resolve({ id: "created-budget" });
  await env.settle();
  assert.equal(env.imports[0]!.budgetId, "created-budget");
  env.imports[0]!.request.reject(new Error("request interrupted"));
  await env.settle();
  assert.equal(env.pushed.length, 0);
  assert.ok(text(env.render()).includes("Reintentar importación EDT"));
  assert.ok(text(env.render()).includes("Abrir presupuesto creado"));
  env.submit();
  assert.equal(env.creations.length, 1);
  assert.equal(env.imports.length, 2);
  assert.equal(env.imports[1]!.budgetId, "created-budget");
  env.imports[1]!.request.resolve({ createdNodes: 1, createdItems: 1 });
  await env.settle();
  assert.deepEqual(env.pushed, ["/proyectos/project/presupuestos/created-budget"]);
});

test("budget creation waits for file parsing and preserves a retry after creation rejection", async () => {
  const env = budgetForm();
  (elements(env.render(), "budget-preload")[0]!.props.onPendingChange as (pending: boolean) => void)(true);
  env.submit();
  assert.equal(env.creations.length, 0);
  (elements(env.render(), "budget-preload")[0]!.props.onPendingChange as (pending: boolean) => void)(false);
  env.submit();
  env.creations[0]!.reject(new Error("hidden transport details"));
  await env.settle();
  assert.ok(text(env.render()).includes("Volvé a intentar"));
  env.submit();
  env.creations[1]!.resolve({ id: "retry-budget" });
  await env.settle();
  assert.equal(env.pushed[0], "/proyectos/project/presupuestos/retry-budget");
});

test("creation controls have names associated with their labels", () => {
  const tree = budgetForm().render();
  const labels = elements(tree, "label");
  for (const type of ["input", "decimal-input", "currency-select", "textarea"]) {
    for (const control of elements(tree, type)) {
      assert.ok(control.props.id, `${type} must have an id`);
      assert.ok(labels.some((label) => label.props.htmlFor === control.props.id && text(label).trim()), `${String(control.props.id)} must have an accessible label`);
    }
  }
});

test("preloading clears previous rows while another file is parsed and reports completion", async () => {
  const env = environment();
  const reads: ReturnType<typeof deferred<unknown[][]>>[] = [];
  const rows: unknown[] = [];
  const pending: boolean[] = [];
  const { BudgetWbsPreloadSection } = loadModule<{ BudgetWbsPreloadSection: (props: unknown) => Element }>("../components/budget-wbs-preload-section.tsx", {
    ...env.dependencies,
    "../lib/read-spreadsheet": { readSpreadsheetFile: () => { const request = deferred<unknown[][]>(); reads.push(request); return request.promise; } },
    "@bloqer/services/budget-import-pure": { previewSpreadsheetImport: () => ({ valid: true, rows: [{ code: "1", type: "ITEM", name: "Partida", _row: 1 }], errors: [], warnings: [] }) },
  });
  const render = () => env.render(() => BudgetWbsPreloadSection({ onPendingRowsChange: (next: unknown) => rows.push(next), onPendingChange: (next: boolean) => pending.push(next) }));
  click(button(render(), "Precargar estructura EDT (opcional)▼"));
  function file(name: string) {
    (elements(render(), "input")[0]!.props.onChange as (event: unknown) => void)({ target: { files: [{ name }], value: name } });
  }
  file("primero.csv");
  assert.equal(rows.at(-1), null);
  assert.equal(pending.at(-1), true);
  reads[0]!.resolve([["1", "Partida"]]);
  await env.settle();
  assert.ok(Array.isArray(rows.at(-1)));
  file("segundo.csv");
  assert.equal(rows.at(-1), null);
  reads[1]!.reject(new Error("Formato inválido"));
  await env.settle();
  assert.equal(rows.at(-1), null);
  assert.equal(pending.at(-1), false);
  click(button(render(), "Quitar archivo"));
  assert.ok(!text(render()).includes("segundo.csv"));
});

test("blocked browser preference storage leaves WBS viewing and toggles usable", () => {
  const env = environment();
  const { BudgetWbsViewProvider } = loadModule<{ BudgetWbsViewProvider: (props: unknown) => Element }>("./wbs-view-mode.tsx", {
    react: { ...env.react, createContext: () => ({ Provider: "provider" }) },
  }, { sessionStorage: { getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("QuotaExceededError"); } } });
  const render = () => env.render(() => BudgetWbsViewProvider({ budgetId: "budget", children: "EDT" }));
  render();
  const value = render().props.value as { patchViewMode: (patch: unknown) => void };
  assert.doesNotThrow(() => value.patchViewMode({ showUnit: true }));
  assert.equal((render().props.value as { viewMode: { showUnit: boolean } }).viewMode.showUnit, true);
});

test("WBS import keeps a valid preview after a rejected save and locks dismissal in flight", async () => {
  const env = environment();
  const executions: ReturnType<typeof deferred<unknown>>[] = [];
  const closed: boolean[] = [];
  const { WbsImportDialog } = loadModule<{ WbsImportDialog: (props: unknown) => Element }>("../components/wbs-import-dialog.tsx", {
    ...env.dependencies, "../lib/read-spreadsheet": { readSpreadsheetFile: async () => [["1", "Partida"]] },
  });
  const render = () => env.render(() => WbsImportDialog({ open: true, hasExistingNodes: false, onOpenChange: (open: boolean) => closed.push(open), onPreview: async () => ({ valid: true, rows: [{ code: "1", name: "Partida", type: "ITEM", _row: 1 }], errors: [], warnings: [] }), onExecute: () => { const request = deferred<unknown>(); executions.push(request); return request.promise; } }));
  (elements(render(), "input").find((node) => node.props.type === "file")!.props.onChange as (e: unknown) => void)({ target: { files: [{}], value: "file.csv" } });
  await env.settle();
  (elements(render(), "input").find((node) => node.props.id === "confirm-import")!.props.onChange as (e: unknown) => void)({ target: { checked: true } });
  const tree = render();
  const start = button(tree, "Importar");
  click(start);
  click(start);
  (tree.props.onOpenChange as (open: boolean) => void)(false);
  assert.equal(executions.length, 1);
  assert.equal(closed.length, 0);
  executions[0]!.reject(new Error("transport"));
  await env.settle();
  assert.ok(text(render()).includes("Partida"));
  assert.equal(button(render(), "Importar").props.disabled, false);
  click(button(render(), "Importar"));
  executions[1]!.resolve({ createdNodes: 1, createdItems: 1 });
  await env.settle();
  assert.deepEqual(closed, [false]);
  assert.equal(env.refreshes(), 1);
});

test("replacing an existing EDT requires the explicit replacement checkbox before importing", async () => {
  const env = environment();
  const executions: unknown[] = [];
  const { WbsImportDialog } = loadModule<{ WbsImportDialog: (props: unknown) => Element }>("../components/wbs-import-dialog.tsx", {
    ...env.dependencies, "../lib/read-spreadsheet": { readSpreadsheetFile: async () => [["1", "Partida"]] },
  });
  const render = () => env.render(() => WbsImportDialog({
    open: true, hasExistingNodes: true, onOpenChange() {},
    onPreview: async () => ({ valid: true, rows: [{ code: "1", name: "Partida", type: "ITEM", _row: 1 }], errors: [], warnings: [] }),
    onExecute: async (_rows: unknown, options: unknown) => { executions.push(options); return { createdNodes: 1, createdItems: 1 }; },
  }));
  (elements(render(), "input").find((node) => node.props.type === "file")!.props.onChange as (e: unknown) => void)({ target: { files: [{}], value: "same-file.csv" } });
  await env.settle();
  (elements(render(), "input").find((node) => node.props.id === "confirm-import")!.props.onChange as (e: unknown) => void)({ target: { checked: true } });
  assert.equal(button(render(), "Importar").props.disabled, true);
  click(button(render(), "Importar"));
  assert.equal(executions.length, 0);
  (elements(render(), "input").find((node) => node.props.id === "replace-wbs")!.props.onChange as (e: unknown) => void)({ target: { checked: true } });
  assert.equal(button(render(), "Importar").props.disabled, false);
  click(button(render(), "Importar"));
  await env.settle();
  assert.equal((executions[0] as { replaceExisting: boolean }).replaceExisting, true);
});

function apu(quantity = "3", analysisLines?: unknown[]) {
  const env = environment();
  const saves: { payload: unknown; request: ReturnType<typeof deferred<unknown>> }[] = [];
  const closed: boolean[] = [];
  const costItem = {
    id: "cost-item", unit: "m2", quantity, notes: null,
    analysisLines: analysisLines ?? [
      { id: "material", category: "MATERIAL", description: "Material", unit: "un", coefficient: "0.3333", unitCost: "1", totalCost: "0.33", partidaQuantity: "1", sortOrder: 0 },
      { id: "other", category: "OTHER", description: "Costo heredado", unit: "un", coefficient: "1", unitCost: "1", totalCost: "1", partidaQuantity: null, sortOrder: 1 },
    ],
  };
  const { CostItemApuDialog } = loadModule<{ CostItemApuDialog: (props: unknown) => Element }>("../components/cost-item-apu-dialog.tsx", {
    ...env.dependencies, "@bloqer/domain": domain, "@bloqer/utils": money,
    "@bloqer/validators": validators,
    "@/lib/format-money": { formatMoneyAmount: (value: string) => `M:${money.serializeMoney(value)}`, formatQtyFromString: String },
    "@/lib/budget-categories": { CATEGORY_LABELS: { MATERIAL: "Materiales", LABOR: "Mano de obra", EQUIPMENT: "Equipos", SUBCONTRACT: "Subcontratos", OTHER: "Otros" }, VISIBLE_COST_CATEGORIES: ["MATERIAL", "LABOR", "EQUIPMENT", "SUBCONTRACT"] },
    "@/lib/budget-units": { budgetUnitLabel: String },
    "./unit-select": { UnitSelect: "unit-select" },
    "./cost-analysis-line-form": { CostAnalysisLineForm: "line-form" },
    "./apu-entry-mode-toggle": { ApuEntryModeToggle: "entry-mode" },
    "../lib/wbs-apu-detail": apuDetails,
    "../lib/apu-money": apuMoney,
    "@bloqer/services/budget-apu-calc": { computeApuUnitContribution },
  });
  const render = () => env.render(() => CostItemApuDialog({ open: true, editable: true, currency: "ARS", node: { id: "node", code: "1", name: "Partida", children: [], costItem }, onOpenChange: (open: boolean) => closed.push(open), onSaveApu: (payload: unknown) => { const request = deferred<unknown>(); saves.push({ payload, request }); return request.promise; } }));
  render(); // Opening initializes local edits from the real DTO.
  return { ...env, render, saves, closed };
}

test("APU shows authoritative contribution totals and includes legacy OTHER in the direct cost", () => {
  const env = apu();
  const tree = env.render();
  assert.ok(text(tree).includes("M:1.33"));
  assert.ok(text(tree).includes("M:3.99"));
  assert.ok(elements(tree, "tablecell").some((node) => text(node) === "0.99"), "partida total is 0.33 × 3, not resource 1 × price 1");
  assert.ok(text(tree).includes("incluidas en el costo directo"));
});

test("APU save keeps edits after rejection and blocks duplicate saves and closing", async () => {
  const env = apu();
  change(elements(env.render(), "textarea")[0]!, "Notas conservadas");
  const tree = env.render();
  const save = button(tree, "Guardar cambios");
  click(save);
  click(save);
  (elements(tree, "dialog")[0]!.props.onOpenChange as (open: boolean) => void)(false);
  assert.equal(env.saves.length, 1);
  assert.equal(env.closed.length, 0);
  assert.equal(elements(env.render(), "dialog-content")[0]!.props.closeButtonDisabled, true);
  env.saves[0]!.request.reject(new Error("internal"));
  await env.settle();
  assert.equal(elements(env.render(), "textarea")[0]!.props.value, "Notas conservadas");
  assert.equal(env.errors[0], "No se pudo completar la acción. Volvé a intentar.");
  click(button(env.render(), "Guardar cambios"));
  assert.equal((env.saves[1]!.payload as { notes: string }).notes, "Notas conservadas");
  env.saves[1]!.request.resolve({ ok: true });
  await env.settle();
  assert.deepEqual(env.closed, [false]);
  assert.equal(env.refreshes(), 1);
});

test("APU refuses to discard an unadded resource line when saving the item", () => {
  const env = apu();
  change(elements(env.render(), "input").find((node) => node.props.placeholder === "Nombre")!, "Insumo sin agregar");
  click(button(env.render(), "Guardar cambios"));
  assert.equal(env.saves.length, 0);
  assert.ok(env.errors[0]?.includes("Agregá la línea APU"));
});

test("new APU resource contributions are rounded per line before aggregating and submitting", async () => {
  const env = apu("5", []);
  for (const description of ["Recurso uno", "Recurso dos"]) {
    change(elements(env.render(), "input").find((node) => node.props.placeholder === "Nombre")!, description);
    (elements(env.render(), "decimal-input").find((node) => String(node.props.id).endsWith("-new-price"))!.props.onValueChange as (value: string) => void)("0.52");
    click(button(env.render(), "Agregar"));
  }
  assert.ok(text(env.render()).includes("M:0.20"));
  assert.ok(text(env.render()).includes("M:1.00"));
  click(button(env.render(), "Guardar cambios"));
  const lines = (env.saves[0]!.payload as { lines: { totalCost: number }[] }).lines;
  assert.equal(lines[0]!.totalCost, 0.1);
  assert.equal(lines[1]!.totalCost, 0.1);
  env.saves[0]!.request.resolve({ ok: true });
  await env.settle();
});

test("APU resource contribution avoids double rounding at a half-cent boundary", () => {
  const env = apu("5.24", []);
  change(elements(env.render(), "input").find((node) => node.props.placeholder === "Nombre")!, "Recurso");
  (elements(env.render(), "decimal-input").find((node) => String(node.props.id).endsWith("-new-price"))!.props.onValueChange as (value: string) => void)("0.55");
  click(button(env.render(), "Agregar"));
  // 0.55 / 5.24 = 0.1049618…; rounding through 4 dp would incorrectly produce 0.11.
  assert.ok(text(env.render()).includes("M:0.10"));
  assert.ok(!text(env.render()).includes("M:0.11"));
});

test("an imported zero-quantity item tracks the first positive quantity when recomputing new resources", () => {
  const env = apu("0", []);
  function setQuantity(value: string) {
    const control = elements(env.render(), "decimal-input").find((node) => String(node.props.id).endsWith("-quantity"))!;
    (control.props.onValueChange as (value: string) => void)(value);
    (elements(env.render(), "decimal-input").find((node) => String(node.props.id).endsWith("-quantity"))!.props.onBlur as () => void)();
  }
  setQuantity("5");
  change(elements(env.render(), "input").find((node) => node.props.placeholder === "Nombre")!, "Recurso");
  (elements(env.render(), "decimal-input").find((node) => String(node.props.id).endsWith("-new-price"))!.props.onValueChange as (value: string) => void)("0.52");
  click(button(env.render(), "Agregar"));
  setQuantity("10");
  assert.ok(text(env.render()).includes("M:0.05"));
  assert.ok(text(env.render()).includes("M:0.50"));
});

test("opening legacy APU preserves its contribution while dirty preview and payload show the recalculated result", async () => {
  const env = apu("5", [
    { id: "legacy-one", category: "MATERIAL", description: "Recurso uno", unit: "un", coefficient: "0.2", unitCost: "0.52", totalCost: "0.1040", partidaQuantity: "1", sortOrder: 0 },
    { id: "legacy-two", category: "MATERIAL", description: "Recurso dos", unit: "un", coefficient: "0.2", unitCost: "0.52", totalCost: "0.1040", partidaQuantity: "1", sortOrder: 1 },
  ]);
  assert.ok(text(env.render()).includes("M:1.05"));
  assert.ok(!text(env.render()).includes("Vista previa al guardar"));
  assert.equal(env.saves.length, 0);
  change(elements(env.render(), "textarea")[0]!, "Cambio de notas");
  assert.ok(text(env.render()).includes("M:1.00"));
  assert.ok(text(env.render()).includes("Vista previa al guardar"));
  click(button(env.render(), "Guardar cambios"));
  assert.ok((env.saves[0]!.payload as { lines: { totalCost: number }[] }).lines.every((line) => line.totalCost === 0.1));
  env.saves[0]!.request.resolve({ ok: true });
  await env.settle();
});

test("out-of-capacity resource input does not crash the APU preview or create an unpersistable line", () => {
  const env = apu("5", []);
  change(elements(env.render(), "input").find((node) => node.props.placeholder === "Nombre")!, "Recurso fuera de capacidad");
  (elements(env.render(), "decimal-input").find((node) => String(node.props.id).endsWith("-new-price"))!.props.onValueChange as (value: string) => void)("1e300");
  assert.doesNotThrow(() => env.render());
  click(button(env.render(), "Agregar"));
  assert.ok(env.errors[0]?.includes("capacidad"));
  assert.equal(elements(env.render(), "tablerow").length, 0);
  assert.equal(env.saves.length, 0);
});

function wbsTree(group = false, withCostItem = true) {
  const env = environment();
  let ensures = 0;
  const leaf: WbsViewNode = { id: "leaf", budgetId: "budget", description: null, code: group ? "1.1" : "1", name: "Partida", type: "ITEM", parentId: group ? "group" : null, sortOrder: 0, children: [], totalCostDirect: "1", totalSalePrice: "1", costItem: withCostItem ? { id: "cost-item", unit: "m2", quantity: "1", unitCostDirect: "1", unitSalePrice: "1", totalCostDirect: "1", totalSalePrice: "1", notes: null, analysisLines: [] } : null };
  const nodes: WbsViewNode[] = group ? [{ id: "group", budgetId: "budget", description: null, code: "1", name: "Capítulo", type: "GROUP", parentId: null, sortOrder: 0, costItem: null, totalCostDirect: "1", totalSalePrice: "1", children: [leaf] }] : [leaf];
  const { WbsTree } = loadModule<{ WbsTree: (props: unknown) => Element }>("../components/wbs-tree.tsx", {
    ...env.dependencies,
    "lucide-react": Object.fromEntries(["ChevronDown", "ChevronRight", "ChevronsDown", "ChevronsUp", "Plus", "Pencil", "Trash2", "ArrowUp", "ArrowDown", "Upload", "MoreHorizontal"].map((name) => [name, "icon"])),
    "@/components/ui/dropdown-menu": Object.fromEntries(["DropdownMenu", "DropdownMenuContent", "DropdownMenuItem", "DropdownMenuSeparator", "DropdownMenuTrigger"].map((name) => [name, name.toLowerCase()])),
    "@/components/ui/confirm-dialog": { ConfirmDialog: "confirm-dialog" },
    "@/lib/utils": { cn: (...values: unknown[]) => values.filter(Boolean).join(" ") },
    "@/lib/format-money": { formatBudgetQtyFromString: String, formatMoneyAmount: String, formatQtyFromString: String, formatUnitPriceFromString: String },
    "@/lib/budget-units": { budgetUnitLabel: String },
    "@/components/ui/list-empty-state": { ListEmptyState: "empty" },
    "./wbs-node-form": { WbsNodeForm: "node-form" },
    "./wbs-tree-toolbar": { WbsTreeToolbar: "tree-toolbar" },
    "../lib/wbs-view-mode": { useBudgetWbsViewMode: () => ({ viewMode: { base: "cost", detail: "compact", showUnit: false, showIncidence: false }, patchViewMode() {} }) },
    "./cost-item-apu-dialog": { CostItemApuDialog: "apu-dialog" },
    "./wbs-group-dialog": { WbsGroupDialog: "group-dialog" },
    "./wbs-import-dialog": { WbsImportDialog: "import-dialog" },
    "@bloqer/domain": domain,
    "@bloqer/services/wbs-metrics": wbsMetrics,
    "@/lib/budget-categories": { WBS_EDT_BREAKDOWN_HEADERS: {}, VISIBLE_COST_CATEGORIES: ["MATERIAL", "LABOR", "EQUIPMENT", "SUBCONTRACT"] },
    "../lib/wbs-codes": wbsCodes,
    "../lib/wbs-apu": wbsApu,
    "../lib/wbs-apu-detail": apuDetails,
    "./wbs-subdivide-apu-dialog": { WbsSubdivideApuDialog: "subdivide-dialog" },
  });
  const render = () => env.render(() => WbsTree({ nodes, currency: "ARS", editable: group, structureEditable: false, onEnsureLeafForApu: async () => { ensures++; return { node: leaf }; } }));
  return { ...env, render, ensures: () => ensures };
}

test("a native named control opens the APU for keyboard users without granting edit permission", () => {
  const env = wbsTree();
  const trigger = elements(env.render(), "button").find((node) => node.props["aria-label"] === "Abrir APU de 1 — Partida");
  assert.ok(trigger, "a row click alone is not keyboard accessible");
  assert.equal(trigger.props.type, "button");
  let stopped = false;
  (trigger.props.onClick as (event: { stopPropagation: () => void }) => void)({ stopPropagation: () => { stopped = true; } });
  assert.equal(stopped, true);
  const dialog = elements(env.render(), "apu-dialog")[0]!;
  assert.equal(dialog.props.open, true);
  assert.equal(dialog.props.editable, false);
  assert.equal(env.ensures(), 0);
});

test("a schedule-baseline chapter stays read-only even while item economics are editable", () => {
  const env = wbsTree(true);
  (elements(env.render(), "button").find((node) => node.props["aria-label"] === "Abrir capítulo 1 — Capítulo")!.props.onClick as (event: unknown) => void)({ stopPropagation() {} });
  const dialog = elements(env.render(), "group-dialog")[0]!;
  assert.equal(dialog.props.open, true);
  assert.equal(dialog.props.editable, false);
});

test("viewing a leaf without a cost item never calls the mutating ensure action", () => {
  const env = wbsTree(false, false);
  (elements(env.render(), "button").find((node) => node.props["aria-label"] === "Abrir APU de 1 — Partida")!.props.onClick as (event: unknown) => void)({ stopPropagation() {} });
  assert.equal(env.ensures(), 0);
  assert.ok(env.errors[0]?.includes("todavía no tiene un APU"));
});

function metadata(status: string, canEdit = true, name = "Presupuesto original") {
  const env = environment();
  const requests: { payload: Record<string, unknown>; request: ReturnType<typeof deferred<unknown>> }[] = [];
  const values: Record<string, unknown> = {};
  let initialized = false;
  let resolver: typeof validators.updateBudgetSchema | undefined;
  const form = {
    register: (name: string) => ({ name, onChange: (event: { target: { value: string } }) => { values[name] = event.target.value; } }),
    formState: { errors: {} },
    reset: (next: Record<string, unknown>) => Object.assign(values, next),
    handleSubmit: (callback: (data: Record<string, unknown>) => void) => () => {
      const parsed = resolver!.safeParse({ ...values });
      if (parsed.success) callback(parsed.data);
    },
  };
  const { BudgetMetadataSection } = loadModule<{ BudgetMetadataSection: (props: unknown) => Element }>("../components/budget-metadata-section.tsx", {
    ...env.dependencies, "@bloqer/validators": validators,
    "react-hook-form": { useForm: (options: { defaultValues: Record<string, unknown>; resolver: typeof validators.updateBudgetSchema }) => { resolver = options.resolver; if (!initialized) { Object.assign(values, options.defaultValues); initialized = true; } return form; } },
    "@hookform/resolvers/zod": { zodResolver: (schema: unknown) => schema },
  });
  const render = () => env.render(() => BudgetMetadataSection({ name, internalNotes: "Nota original", status, canEdit, onSubmit: (payload: Record<string, unknown>) => { const request = deferred<unknown>(); requests.push({ payload, request }); return request.promise; } }));
  const submit = () => (elements(render(), "form")[0]!.props.onSubmit as () => void)();
  return { ...env, render, submit, requests, values };
}

test("budget metadata stays visible to readers and only notes can be submitted for a closed budget", async () => {
  for (const [status, canEdit] of [["DRAFT", false], ["CANCELLED", true]] as [string, boolean][]) {
    const readOnly = metadata(status, canEdit).render();
    assert.equal(elements(readOnly, "form").length, 0);
    assert.ok(text(readOnly).includes("Presupuesto original"));
    assert.ok(text(readOnly).includes("Nota original"));
  }
  const env = metadata("CLOSED");
  assert.equal(elements(env.render(), "input")[0]!.props.readOnly, true);
  env.values.name = "Must not rename";
  change(elements(env.render(), "textarea")[0]!, "");
  env.submit();
  assert.equal(env.requests.length, 1);
  assert.deepEqual(Object.keys(env.requests[0]!.payload), ["internalNotes"]);
  assert.equal(env.requests[0]!.payload.internalNotes, "");
  env.requests[0]!.request.resolve({ ok: true });
  await env.settle();
  assert.equal(env.values.name, "Presupuesto original");
});

test("metadata rejects duplicate saves, conserves edited notes on failure and retries successfully", async () => {
  const env = metadata("IN_REVIEW");
  change(elements(env.render(), "input")[0]!, "Nombre revisado");
  change(elements(env.render(), "textarea")[0]!, "Notas conservadas");
  env.submit();
  env.submit();
  assert.equal(env.requests.length, 1);
  env.requests[0]!.request.resolve({ error: "La obra está pausada" });
  await env.settle();
  assert.ok(text(env.render()).includes("La obra está pausada"));
  assert.equal(env.values.internalNotes, "Notas conservadas");
  env.submit();
  env.requests[1]!.request.reject(new Error("private service details"));
  await env.settle();
  assert.ok(text(env.render()).includes("Volvé a intentar"));
  assert.equal(env.values.name, "Nombre revisado");
  assert.equal(env.values.internalNotes, "Notas conservadas");
  env.submit();
  assert.equal(env.requests[2]!.payload.name, "Nombre revisado");
  assert.equal(env.requests[2]!.payload.internalNotes, "Notas conservadas");
  env.requests[2]!.request.resolve({ ok: true });
  await env.settle();
  assert.ok(text(env.render()).includes("Datos guardados."));
  assert.equal(env.refreshes(), 1);
});

test("closed budget legacy names cannot prevent saving allowed internal notes", async () => {
  const env = metadata("CLOSED", true, "   ");
  change(elements(env.render(), "textarea")[0]!, "Nota nueva sin cambiar nombre contractual");
  env.submit();
  assert.equal(env.requests.length, 1);
  assert.equal(env.requests[0]!.payload.internalNotes, "Nota nueva sin cambiar nombre contractual");
  assert.ok(!Object.hasOwn(env.requests[0]!.payload, "name"));
  env.requests[0]!.request.resolve({ ok: true });
  await env.settle();
  assert.equal(env.values.name, "   ");
});
