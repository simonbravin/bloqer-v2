import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createProjectSchema } from "@bloqer/validators";

type Element = { type: string; props: Record<string, unknown> };
const jsx = (type: string, props: Record<string, unknown>): Element => ({ type, props });

function elements(tree: unknown, type: string): Element[] {
  if (Array.isArray(tree)) return tree.flatMap((node) => elements(node, type));
  if (!tree || typeof tree !== "object" || !("props" in tree)) return [];
  const node = tree as Element;
  if (node.type === "dialog" && !node.props.open) return [];
  return [...(node.type === type ? [node] : []), ...Object.values(node.props).flatMap((prop) => elements(prop, type))];
}

function text(tree: unknown): string {
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join("");
  if (!tree || typeof tree !== "object" || !("props" in tree)) return "";
  return text((tree as Element).props.children);
}

function button(tree: unknown, label: string): Element {
  const found = elements(tree, "button").find((node) => text(node) === label);
  assert.ok(found, `Missing button: ${label}`);
  return found;
}

function click(node: Element) { (node.props.onClick as () => void)(); }
function change(node: Element, value: string) {
  (node.props.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
}

function loadModule<T>(filename: string, dependencies: Record<string, unknown>): T {
  const compiled = ts.transpileModule(readFileSync(new URL(filename, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  runInNewContext(compiled, {
    exports,
    window: { location: { hash: "" }, addEventListener() {}, removeEventListener() {} },
    require: (name: string) => {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
      assert.ok(Object.hasOwn(dependencies, name), `Unmocked interaction dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports as T;
}

/** Controlled renders execute real component/hook logic; React scheduling and DOM need browser smoke. */
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
    useEffect(callback: () => void | (() => void), deps: unknown[]) {
      const position = index++;
      const previous = slots[position] as { deps: unknown[]; cleanup?: () => void } | undefined;
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
        effects.push(() => {
          previous?.cleanup?.();
          slots[position] = { deps, cleanup: callback() };
        });
      }
    },
    useId: () => "interaction-form",
    useMemo: (callback: () => unknown) => callback(),
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
      const pendingEffects = effects;
      effects = [];
      pendingEffects.forEach((effect) => effect());
      return tree;
    },
    async settle() {
      await Promise.all(transitions.splice(0));
      // Flush component continuations whose event handler deliberately returns void.
      await setImmediate();
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const dialog = { Dialog: "dialog", DialogContent: "dialog-content", DialogHeader: "dialog-header", DialogTitle: "dialog-title", DialogDescription: "dialog-description", DialogFooter: "dialog-footer" };
const select = { Select: "select", SelectContent: "select-content", SelectItem: "select-item", SelectTrigger: "select-trigger", SelectValue: "select-value" };
const ui = {
  "@/components/ui/button": { Button: "button" },
  "@/components/ui/label": { Label: "label" },
  "@/components/ui/input": { Input: "input" },
  "@/components/ui/textarea": { Textarea: "textarea" },
  "@/components/ui/dialog": dialog,
  "@/components/ui/select": select,
};

function lifecycle(status = "ACTIVE") {
  const harness = hooks();
  const impacts: ReturnType<typeof deferred<unknown>>[] = [];
  const mutations: ReturnType<typeof deferred<unknown>>[] = [];
  const invalidated: string[] = [];
  let refreshed = 0;
  const errors: string[] = [];
  const confirmation = loadModule<Record<string, unknown>>("../../../hooks/use-confirmation-action.ts", { react: harness.react });
  const action = () => { const next = deferred<unknown>(); mutations.push(next); return next.promise; };
  const { ProjectLifecycleActions } = loadModule<{ ProjectLifecycleActions: (props: unknown) => unknown }>("../components/project-lifecycle-actions.tsx", {
    ...ui, react: harness.react,
    "next/link": { default: "link" },
    "next/navigation": { useRouter: () => ({ refresh: () => { refreshed++; } }) },
    sonner: { toast: { error: (message: string) => errors.push(message), success() {} } },
    "@/hooks/use-confirmation-action": confirmation,
    "@/lib/project-shell-context": { invalidateProjectShellCache: (id: string) => invalidated.push(id) },
    "@/app/(app)/proyectos/actions": {
      activateProjectAction: action, pauseProjectAction: action, resumeProjectAction: action, completeProjectAction: action, cancelProjectAction: action, reactivateProjectAction: action,
      getProjectCancellationImpactAction: () => { const next = deferred<unknown>(); impacts.push(next); return next.promise; },
    },
  });
  return {
    ...harness, impacts, mutations, invalidated, errors,
    render: () => harness.render(() => ProjectLifecycleActions({ projectId: "project", status, canEditProject: true, canCancelActive: true, canReactivate: true })),
    refreshed: () => refreshed,
  };
}

test("cancellation impact failures are recoverable and stale responses cannot block a reopened dialog", async () => {
  const component = lifecycle();
  click(button(component.render(), "Cancelar proyecto"));
  component.impacts[0]!.reject(new Error("private details"));
  await component.settle();
  let tree = component.render();
  assert.equal(button(tree, "Confirmar").props.disabled, true);
  assert.ok(text(tree).includes("No se pudo verificar el impacto"));
  assert.ok(!text(tree).includes("private details"));
  click(button(tree, "Reintentar"));
  tree = component.render();
  assert.equal(button(tree, "Confirmar").props.disabled, true);
  click(button(tree, "Volver"));
  click(button(component.render(), "Cancelar proyecto"));
  assert.equal(component.impacts.length, 3);
  component.impacts[1]!.resolve({ impact: { hasBlockers: true, blockers: [{ key: "old", label: "Viejo", count: 1 }] } });
  await component.settle();
  assert.ok(text(component.render()).includes("Verificando documentos abiertos"));
  component.impacts[2]!.resolve({ impact: { hasBlockers: false, blockers: [] } });
  await component.settle();
  tree = component.render();
  change(elements(tree, "textarea")[0]!, "Motivo válido");
  assert.equal(button(component.render(), "Confirmar").props.disabled, false);
});

test("lifecycle saves block duplicates and dismissal, recover a rejection, then refresh shell after success", async () => {
  const component = lifecycle("DRAFT");
  click(button(component.render(), "Activar"));
  let tree = component.render();
  const confirm = button(tree, "Confirmar");
  click(confirm);
  click(confirm);
  (elements(tree, "dialog")[0]!.props.onOpenChange as (open: boolean) => void)(false);
  assert.equal(component.mutations.length, 1);
  tree = component.render();
  assert.equal(elements(tree, "dialog").length, 1);
  assert.equal(button(tree, "Procesando…").props.disabled, true);
  component.mutations[0]!.reject(new Error("private details"));
  await component.settle();
  tree = component.render();
  assert.ok(text(tree).includes("No se pudo completar la acción"));
  assert.deepEqual(component.invalidated, []);
  click(button(tree, "Confirmar"));
  component.mutations[1]!.resolve({ ok: true });
  await component.settle();
  assert.deepEqual(component.invalidated, ["project"]);
  assert.equal(component.refreshed(), 1);
  assert.equal(elements(component.render(), "dialog").length, 0);
});

test("all profile forms send explicit clears and keep their dialog locked during the save", async () => {
  for (const role of ["CLIENT", "SUPPLIER", "SUBCONTRACTOR"]) {
    const harness = hooks();
    const saving = deferred<{ ok: true }>();
    const payloads: Record<string, unknown>[] = [];
    let refreshed = 0;
    const save = (_id: string, payload: Record<string, unknown>) => { payloads.push(payload); return saving.promise; };
    const { RoleManager } = loadModule<{ RoleManager: (props: unknown) => unknown }>("../../directory/components/role-manager.tsx", {
      ...ui, react: harness.react,
      "next/navigation": { useRouter: () => ({ refresh: () => { refreshed++; } }) },
      "@/components/ui/decimal-input": { DecimalInput: "decimal" },
      "./role-badge": { RoleBadge: "role-badge" },
      "@/app/(app)/directorio/actions": { updateClientProfileAction: save, updateSupplierProfileAction: save, updateSubcontractorProfileAction: save },
    });
    const render = () => harness.render(() => RoleManager({
      contactId: "contact", canEdit: true, roles: [{ id: "role", role, status: "ACTIVE" }],
      clientProfile: { paymentTermsDays: 15, defaultCurrency: "ARS", creditLimit: "1000.00", notes: "Anterior" },
      supplierProfile: { paymentTermsDays: 15, defaultCurrency: "ARS", bankAccount: "Anterior", notes: "Anterior" },
      subcontractorProfile: { specialty: "Anterior", notes: "Anterior" },
    }));
    click(button(render(), "Editar perfil"));
    let tree = render();
    for (const field of elements(tree, "input")) {
      if (String(field.props.id).endsWith("-edit-bank") || String(field.props.id).endsWith("-edit-specialty") || String(field.props.id).endsWith("-edit-notes")) change(field, "");
    }
    const credit = elements(tree, "decimal")[0];
    if (credit) (credit.props.onValueChange as (value: string) => void)("");
    tree = render();
    const saveButton = button(tree, "Guardar");
    click(saveButton);
    click(saveButton);
    for (const modal of elements(tree, "dialog")) (modal.props.onOpenChange as (open: boolean) => void)(false);
    assert.equal(payloads.length, 1);
    assert.equal(payloads[0]!.notes, "");
    if (role === "CLIENT") assert.equal(payloads[0]!.creditLimit, null);
    if (role === "SUPPLIER") assert.equal(payloads[0]!.bankAccount, "");
    if (role === "SUBCONTRACTOR") assert.equal(payloads[0]!.specialty, "");
    assert.equal(elements(render(), "dialog").length, 1);
    saving.resolve({ ok: true });
    await harness.settle();
    assert.equal(elements(render(), "dialog").length, 0);
    assert.equal(refreshed, 1);
  }
});

test("project form preserves explicit date clears, catches failed saves and permits a single retry", async () => {
  const harness = hooks();
  const saves: ReturnType<typeof deferred<unknown>>[] = [];
  const payloads: Record<string, unknown>[] = [];
  const invalidated: string[] = [];
  const pushed: string[] = [];
  const raw = { code: "PRY", name: "Obra", clientContactId: "11111111-1111-4111-8111-111111111111", type: "PRIVATE", startDate: "2026-11-03", expectedEndDate: "" };
  const { ProjectForm } = loadModule<{ ProjectForm: (props: unknown) => unknown }>("../components/project-form.tsx", {
    ...ui, react: harness.react,
    "next/link": { default: "link" },
    "next/navigation": { useRouter: () => ({ push: (href: string) => pushed.push(href) }) },
    "react-hook-form": { useForm: () => ({ formState: { errors: {} }, watch: () => undefined, register: () => ({}), handleSubmit: (callback: (data: unknown) => void) => () => callback(raw) }) },
    "@hookform/resolvers/zod": { zodResolver: () => undefined },
    "@bloqer/validators": { createProjectSchema },
    "@/components/ui/searchable-combobox": { SearchableCombobox: "combobox" },
    "@/lib/searchable-options": { contactsToSearchableOptions: () => [], CONTACT_PICKER_SEARCH_PLACEHOLDER: "" },
    "@/lib/project-shell-context": { invalidateProjectShellCache: (id: string) => invalidated.push(id) },
  });
  const render = () => harness.render(() => ProjectForm({
    clients: [{ id: raw.clientContactId, legalName: "Cliente", fantasyName: null }], successRedirect: "/proyectos/project",
    onSubmit: (payload: Record<string, unknown>) => { payloads.push(payload); const next = deferred<unknown>(); saves.push(next); return next.promise; },
  }));
  let tree = render();
  const submit = elements(tree, "form")[0]!.props.onSubmit as () => void;
  submit();
  submit();
  assert.equal(saves.length, 1);
  assert.equal(payloads[0]!.expectedEndDate, null);
  assert.equal((payloads[0]!.startDate as Date).toISOString(), "2026-11-03T00:00:00.000Z");
  saves[0]!.reject(new Error("private details"));
  await harness.settle();
  tree = render();
  assert.ok(text(tree).includes("No se pudo guardar el proyecto"));
  assert.equal(pushed.length, 0);
  (elements(tree, "form")[0]!.props.onSubmit as () => void)();
  saves[1]!.resolve({ ok: true });
  await harness.settle();
  assert.deepEqual(pushed, ["/proyectos/project"]);
  assert.deepEqual(invalidated, ["project"]);
});

test("team updates retain selection after rejection and unlock a successful retry without duplicate calls", async () => {
  const harness = hooks();
  const mutations: ReturnType<typeof deferred<unknown>>[] = [];
  let refreshed = 0;
  const { ProjectTeamCard } = loadModule<{ ProjectTeamCard: (props: unknown) => unknown }>("../components/project-team-card.tsx", {
    ...ui, react: harness.react,
    "next/navigation": { useRouter: () => ({ refresh: () => { refreshed++; } }) },
    "@/components/ui/card": { Card: "card", CardContent: "card-content", CardHeader: "card-header", CardTitle: "card-title" },
    "@/components/ui/searchable-combobox": { SearchableCombobox: "combobox" },
    "@/app/(app)/proyectos/[id]/team-actions": { addProjectTeamMemberAction: () => { const next = deferred<unknown>(); mutations.push(next); return next.promise; } },
  });
  const render = () => harness.render(() => ProjectTeamCard({ projectId: "project", members: [], pickerOptions: [{ userId: "user", email: "member@example.test", name: null }], canEdit: true }));
  (elements(render(), "combobox")[0]!.props.onValueChange as (value: string) => void)("user");
  let tree = render();
  const add = button(tree, "Agregar");
  click(add);
  click(add);
  assert.equal(mutations.length, 1);
  mutations[0]!.reject(new Error("private details"));
  await harness.settle();
  tree = render();
  assert.ok(text(tree).includes("No se pudo actualizar el equipo de obra"));
  assert.equal(elements(tree, "combobox")[0]!.props.value, "user");
  click(button(tree, "Agregar"));
  mutations[1]!.resolve({ ok: true });
  await harness.settle();
  assert.equal(elements(render(), "combobox")[0]!.props.value, "");
  assert.equal(refreshed, 1);
});
