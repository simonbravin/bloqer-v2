import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { parseScheduleFieldFilter } from "@bloqer/services/schedule-field";
import { parseMaterialsFieldFilter } from "@bloqer/services/materials-field";
import { PROGRESS_DIMENSION_HINTS } from "../adapters/schedule-progress-values";

type Element = { type: string; props: Record<string, unknown> };
const jsx = (type: string, props: Record<string, unknown>): Element => ({ type, props });
function elements(tree: unknown, type: string): Element[] {
  if (Array.isArray(tree)) return tree.flatMap((child) => elements(child, type));
  if (!tree || typeof tree !== "object" || !("props" in tree)) return [];
  const node = tree as Element;
  return [...(node.type === type ? [node] : []), ...Object.values(node.props).flatMap((child) => elements(child, type))];
}
function text(tree: unknown): string {
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join("");
  return tree && typeof tree === "object" && "props" in tree ? text((tree as Element).props.children) : "";
}
function button(tree: unknown, label: string) {
  const node = elements(tree, "Button").find((entry) => text(entry).trim() === label);
  assert.ok(node, `Missing button: ${label}`);
  return node;
}
function load<T>(path: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}): T {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  runInNewContext(code, { exports, URLSearchParams, ...globals, require(name: string) {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
    if (name.startsWith("@/components/ui/")) return new Proxy({}, { get: (_, key) => String(key) });
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
    return dependencies[name];
  } });
  return exports as T;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

/** Exercise real event callbacks and effects; browser smoke covers layout and native input. */
function environment() {
  const slots: unknown[] = [];
  const transitions: Promise<unknown>[] = [];
  let effects: (() => void)[] = [];
  let index = 0;
  const errors: string[] = [];
  let refreshes = 0;
  const react = {
    useState(initial: unknown) {
      const position = index++;
      if (!(position in slots)) slots[position] = typeof initial === "function" ? initial() : initial;
      return [slots[position], (next: unknown) => { slots[position] = typeof next === "function" ? next(slots[position]) : next; }];
    },
    useRef(initial: unknown) {
      const position = index++;
      if (!(position in slots)) slots[position] = { current: initial };
      return slots[position];
    },
    useMemo: (fn: () => unknown) => fn(),
    useCallback: (fn: unknown) => fn,
    useId: () => "schedule-picker",
    useTransition() {
      const [pending, setPending] = react.useState(false);
      return [pending, (action: () => Promise<unknown>) => {
        (setPending as (value: boolean) => void)(true);
        transitions.push(Promise.resolve(action()).finally(() => (setPending as (value: boolean) => void)(false)));
      }];
    },
    useEffect(fn: () => void | (() => void), deps: unknown[]) {
      const position = index++;
      const previous = slots[position] as { deps: unknown[]; cleanup?: () => void } | undefined;
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) effects.push(() => { previous?.cleanup?.(); slots[position] = { deps, cleanup: fn() }; });
    },
  };
  const dependencies: Record<string, unknown> = {
    react,
    sonner: { toast: { error: (message: string) => errors.push(message), success() {}, warning() {} } },
    "next/navigation": { useRouter: () => ({ refresh() { refreshes++; } }) },
  };
  const action = load<Record<string, unknown>>("./use-schedule-action.ts", dependencies);
  dependencies["../lib/use-schedule-action"] = action;
  return { dependencies, errors, action, render<T>(component: () => T) {
    index = 0; const tree = component(); const pending = effects; effects = []; pending.forEach((effect) => effect()); return tree;
  }, async settle() { await Promise.all(transitions.splice(0)); await setImmediate(); }, refreshes: () => refreshes };
}

test("schedule mutation locks before rerender, recovers from rejection and permits retry", async () => {
  const env = environment();
  const hook = env.action.useScheduleAction as () => { pending: boolean; isRunning(): boolean; run(action: () => Promise<unknown>, onFailure?: () => void): void };
  const render = () => env.render(hook);
  const request = deferred<void>(); let writes = 0; let recoveries = 0;
  const first = render();
  first.run(() => { writes++; return request.promise; }, () => { recoveries++; });
  first.run(async () => { writes++; });
  assert.equal(writes, 1);
  assert.equal(first.isRunning(), true);
  assert.equal(render().pending, true);
  request.reject(new Error("private details")); await env.settle();
  assert.equal(recoveries, 1);
  assert.deepEqual(env.errors, ["No se pudo completar la acción. Volvé a intentar."]);
  assert.equal(render().pending, false);
  render().run(async () => { writes++; }); await env.settle();
  assert.equal(writes, 2);
});

test("import cannot be dismissed or submitted twice while pending and keeps data after failure", async () => {
  const env = environment(); const requests: ReturnType<typeof deferred<{ error?: string; ok?: true }>>[] = [];
  const { ScheduleImportDialog } = load<{ ScheduleImportDialog: (props: unknown) => Element }>("../components/schedule-import-dialog.tsx", {
    ...env.dependencies,
    "@/features/budgets/components/budget-status-badge": { budgetFilterOptionLabel: () => "Presupuesto" },
    "../actions/schedule-actions": { importScheduleFromBudgetAction: () => { const request = deferred<{ error?: string; ok?: true }>(); requests.push(request); return request.promise; } },
  });
  const render = () => env.render(() => ScheduleImportDialog({ projectId: "project", budgets: [{ id: "budget" }] }));
  (render().props.onOpenChange as (open: boolean) => void)(true);
  const opened = render(); const submit = button(opened, "Importar").props.onClick as () => void;
  submit(); submit();
  (opened.props.onOpenChange as (open: boolean) => void)(false);
  assert.equal(requests.length, 1);
  assert.equal(render().props.open, true);
  assert.equal(elements(render(), "fieldset")[0]!.props.disabled, true);
  requests[0]!.resolve({ error: "Conflicto: reintentá" }); await env.settle();
  assert.equal(render().props.open, true);
  (button(render(), "Importar").props.onClick as () => void)();
  requests[1]!.resolve({ ok: true }); await env.settle();
  assert.equal(render().props.open, false);
  assert.equal(env.refreshes(), 1);
});

test("a block reason survives a failed attempt", () => {
  const env = environment(); const reasons: string[] = [];
  const { ScheduleBlockDialog } = load<{ ScheduleBlockDialog: (props: unknown) => Element }>("../components/schedule-block-dialog.tsx", env.dependencies);
  const render = () => env.render(() => ScheduleBlockDialog({ open: true, pending: false, itemName: "Tarea", onConfirm: (reason: string) => reasons.push(reason), onOpenChange() {} }));
  render();
  (elements(render(), "Textarea")[0]!.props.onChange as (event: unknown) => void)({ target: { value: "Falta autorización" } });
  (button(render(), "Bloquear").props.onClick as () => void)();
  assert.equal(reasons[0], "Falta autorización");
  assert.equal(elements(render(), "Textarea")[0]!.props.value, "Falta autorización");
});

test("an old task response cannot overwrite the selected task history", async () => {
  const env = environment();
  const history = new Map<string, ReturnType<typeof deferred<unknown>>>();
  const contexts = new Map<string, ReturnType<typeof deferred<unknown>>>();
  const { ScheduleItemDialog } = load<{ ScheduleItemDialog: (props: unknown) => Element }>("../components/schedule-item-dialog.tsx", {
    ...env.dependencies,
    "next/link": { default: "link" },
    "@/lib/searchable-options": { toSearchableOptions: (value: unknown) => value },
    "./schedule-progress-dimensions": {}, "../adapters/schedule-progress-values": {}, "./schedule-procurement-chips": {}, "./schedule-cancel-dialog": {}, "./schedule-wbs-picker": {}, "./schedule-missing-edt-badge": {}, "./schedule-reorder-controls": {},
    "../adapters/schedule-view-types": { STATUS_LABELS: { PLANNED: "Planificado" } },
    "@/features/certifications/components/certification-status-badge": {},
    "@/lib/gantt-date-format": {}, "@/lib/format-money": {},
    "../actions/schedule-actions": {
      listScheduleItemAuditAction: (_project: string, id: string) => { const request = deferred<unknown>(); history.set(id, request); return request.promise; },
      getScheduleItemContextAction: (_project: string, id: string) => { const request = deferred<unknown>(); contexts.set(id, request); return request.promise; },
    },
  });
  const item = (id: string) => ({ id, name: id, isLeaf: true, type: "TASK", status: "PLANNED", progressPct: "0", startDate: null, endDate: null, wbsLinks: [], predecessorDependencies: [], predecessorIds: [], successorIds: [] });
  let id = "A";
  const render = () => env.render(() => ScheduleItemDialog({ projectId: "project", workspace: { treeItems: [], canEdit: false }, allItems: [item("A"), item("B")], itemId: id, open: true, initialTab: "history", onOpenChange() {} }));
  render(); id = "B"; render();
  const response = (label: string) => ({ entries: [{ id: label, summary: `Historial ${label}`, createdAt: "2026-11-04T00:00:00.000Z", actorName: "Persona" }] });
  history.get("B")!.resolve(response("B")); contexts.get("B")!.resolve({ context: {} }); await env.settle();
  assert.match(text(render()), /Historial B/);
  history.get("A")!.resolve(response("A")); contexts.get("A")!.resolve({ context: {} }); await env.settle();
  assert.match(text(render()), /Historial B/);
  assert.doesNotMatch(text(render()), /Historial A/);
});

test("refreshing task integrations preserves unsaved dates in the same task", async () => {
  const env = environment();
  const { ScheduleItemDialog } = load<{ ScheduleItemDialog: (props: unknown) => Element }>("../components/schedule-item-dialog.tsx", {
    ...env.dependencies,
    "next/link": { default: "Link" },
    "@/lib/searchable-options": { toSearchableOptions: (value: unknown) => value },
    "./schedule-progress-dimensions": {}, "../adapters/schedule-progress-values": { PROGRESS_DIMENSION_HINTS },
    "./schedule-procurement-chips": {}, "./schedule-cancel-dialog": {}, "./schedule-wbs-picker": {}, "./schedule-missing-edt-badge": {}, "./schedule-reorder-controls": {},
    "../adapters/schedule-view-types": { STATUS_LABELS: { PLANNED: "Planificado" } },
    "@/features/certifications/components/certification-status-badge": {},
    "@/lib/gantt-date-format": { formatDateAr: String }, "@/lib/format-money": {},
    "../actions/schedule-actions": { listScheduleItemAuditAction: async () => ({ entries: [] }), getScheduleItemContextAction: async () => ({ context: {} }) },
  });
  const item = { id: "task", name: "Tarea", isLeaf: true, type: "TASK", status: "PLANNED", progressPct: "0", startDate: "2026-11-01", endDate: "2026-11-04", wbsLinks: [] as { wbsNodeId: string; isPrimary: boolean }[], predecessorDependencies: [], predecessorIds: [], successorIds: [] };
  const render = () => env.render(() => ScheduleItemDialog({ projectId: "project", workspace: { treeItems: [], canEdit: true, budgetId: null }, allItems: [item], itemId: item.id, open: true, onOpenChange() {} }));
  render(); await env.settle();
  const start = elements(render(), "Input").find((node) => node.props.id === "schedule-item-start")!;
  (start.props.onChange as (event: unknown) => void)({ target: { value: "2026-11-09" } });
  item.wbsLinks = [{ wbsNodeId: "wbs", isPrimary: true }];
  render(); await env.settle();
  assert.equal(elements(render(), "Input").find((node) => node.props.id === "schedule-item-start")!.props.value, "2026-11-09");
});

for (const area of ["schedule", "materials"] as const) {
  test(`${area} field follows URL filter changes and closes a removed deep link`, () => {
    const env = environment(); let params = new URLSearchParams("field=all");
    const root = area === "schedule" ? "/proyectos/project/cronograma" : "/proyectos/project/materiales";
    env.dependencies["next/navigation"] = { usePathname: () => root, useSearchParams: () => params };
    env.dependencies[area === "schedule" ? "@bloqer/services/schedule-field" : "@bloqer/services/materials-field"] = { parseScheduleFieldFilter, parseMaterialsFieldFilter };
    env.dependencies[area === "schedule" ? "./schedule-field-item-sheet" : "./material-field-detail-sheet"] = area === "schedule" ? { ScheduleFieldItemSheet: "sheet" } : { MaterialFieldDetailSheet: "sheet" };
    env.dependencies[area === "schedule" ? "./schedule-field-view" : "./materials-field-view"] = area === "schedule" ? { ScheduleFieldView: "view" } : { MaterialsFieldView: "view" };
    const path = area === "schedule" ? "../components/schedule-field-experience.tsx" : "../../materials/materials-field-experience.tsx";
    const component = load<Record<string, (props: unknown) => Element>>(path, env.dependencies, { window: { location: { search: params.toString() }, history: { replaceState() {}, state: null } } })[area === "schedule" ? "ScheduleFieldExperience" : "MaterialsFieldExperience"]!;
    const props = area === "schedule" ? { projectId: "project", workspace: { items: [{ id: "row" }], canEdit: false } } : { projectId: "project", rows: [{ rowKey: "row" }], canRequest: false };
    const render = () => env.render(() => component(props));
    render(); assert.equal(elements(render(), "view")[0]!.props.fieldParam, "all");
    params = new URLSearchParams(area === "schedule" ? "field=today&itemId=row" : "field=shortfall&rowKey=row");
    render(); assert.equal(elements(render(), "view")[0]!.props.fieldParam, area === "schedule" ? "today" : "shortfall");
    assert.equal(elements(render(), "sheet")[0]!.props.open, true);
    params = new URLSearchParams("field=all"); render();
    assert.equal(elements(render(), "sheet")[0]!.props.open, false);
  });
}

test("an independent schedule exposes all four views without importing or inventing a budget", () => {
  const env = environment(); let view = "gantt";
  const { ScheduleWorkspace } = load<{ ScheduleWorkspace: (props: unknown) => Element }>("../components/schedule-workspace.tsx", {
    ...env.dependencies,
    "next/navigation": { useRouter: () => ({ replace() {} }), usePathname: () => "/proyectos/project/cronograma", useSearchParams: () => new URLSearchParams(`view=${view}`) },
    "@/lib/media-query": { useHasMounted: () => true, useIsLgUp: () => true },
    "@bloqer/services/schedule-field": { parseScheduleFieldFilter },
    "../adapters/schedule-view-types": { filterScheduleItemsForDisplay: (items: unknown) => items },
    "./schedule-summary-cards": { ScheduleSummaryCards: "summary" },
    "./schedule-table-view": { ScheduleTableView: "table-view" },
    "./schedule-gantt-view": { ScheduleGanttView: "gantt-view" },
    "./schedule-kanban-view": { ScheduleKanbanView: "kanban-view" },
    "./schedule-calendar-view": { ScheduleCalendarView: "calendar-view" },
    "./schedule-import-dialog": { ScheduleImportDialog: "import-dialog" },
    "./schedule-create-dialog": { ScheduleCreateDialog: "create-dialog" },
    "./schedule-export-dialog": { ScheduleExportDialog: "export-dialog" },
    "./schedule-item-dialog": { ScheduleItemDialog: "item-dialog" },
    "./schedule-filters": { ScheduleFilters: "filters" },
    "./schedule-field-item-sheet": { ScheduleFieldItemSheet: "sheet" },
    "./schedule-field-view": { ScheduleFieldView: "field", ScheduleFieldViewSkeleton: "skeleton" },
  }, { window: { location: { search: "" }, history: { replaceState() {}, state: null } } });
  const workspace = { projectId: "project", budgetId: null as string | null, budgetName: null, budgetCurrency: null, budgetStatus: null as string | null, baselineBudgetId: null as string | null, metricsWarning: null as string | null, canEdit: true, availableBudgets: [], treeItems: [], items: [{ id: "task", isLeaf: true, predecessorIds: [], wbsLinks: [] }], summary: { totalItems: 1, unfilteredActiveCount: 1 } };
  const render = () => env.render(() => ScheduleWorkspace({ projectId: "project", workspace }));
  for (view of ["gantt", "calendar", "kanban", "table"]) {
    const tree = render();
    assert.equal(elements(tree, `${view}-view`).length, 1);
    assert.match(text(tree), /Planificación independiente · Sin presupuesto base/);
    assert.equal(elements(tree, "import-dialog").length, 0);
    assert.equal(elements(tree, "create-dialog")[0]!.props.canLinkWbs, false);
    assert.equal((elements(tree, "export-dialog")[0]!.props.filters as { budgetId?: string }).budgetId, undefined);
  }
  workspace.metricsWarning = "No se pueden calcular las métricas económicas. Podés seguir planificando las tareas.";
  for (view of ["gantt", "calendar", "kanban", "table"]) {
    const tree = render();
    const warning = elements(tree, "div").find((element) => element.props.role === "status");
    assert.equal(text(warning), workspace.metricsWarning);
    assert.equal(elements(tree, `${view}-view`).length, 1);
    assert.equal(elements(tree, "create-dialog").length, 1);
    assert.equal(elements(tree, "export-dialog").length, 1);
  }
  workspace.metricsWarning = null;
  assert.equal(elements(render(), "div").filter((element) => element.props.role === "status").length, 0);
  workspace.budgetId = "budget"; workspace.baselineBudgetId = "budget";
  for (const status of ["DRAFT", "CANCELLED", null]) {
    workspace.budgetStatus = status;
    assert.equal(elements(render(), "create-dialog")[0]!.props.canLinkWbs, false);
  }
  for (const status of ["APPROVED", "CLOSED"]) {
    workspace.budgetStatus = status;
    assert.equal(elements(render(), "create-dialog")[0]!.props.canLinkWbs, true);
  }
  workspace.canEdit = false;
  assert.equal(elements(render(), "create-dialog").length, 0);
});
