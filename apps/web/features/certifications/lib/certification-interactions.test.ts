import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as utils from "@bloqer/utils";
import * as validators from "@bloqer/validators";
import { previewCertificationMeasurement } from "@bloqer/services/certification-measurement-pure";
import * as formatMoney from "../../../lib/format-money";
import * as attachmentLimits from "../../subcontracts/lib/create-attachment-limits";
import * as domain from "@bloqer/domain";

type Element = { type: unknown; props: Record<string, unknown> };
const jsx = (type: unknown, props: Record<string, unknown>): Element => ({ type, props });
function nodes(tree: unknown): Element[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object" || !("props" in tree)) return [];
  const node = tree as Element;
  return [node, ...Object.values(node.props).flatMap(nodes)];
}
const elements = (tree: unknown, type: string) => nodes(tree).filter((node) => node.type === type);
function text(tree: unknown): string {
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join("");
  return tree && typeof tree === "object" && "props" in tree
    ? text((tree as Element).props.children)
    : "";
}
function load<T>(file: string, dependencies: Record<string, unknown>): T {
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  runInNewContext(code, {
    exports,
    URLSearchParams,
    FormData: FormDataStub,
    require(name: string) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      if (name.startsWith("@/components/ui/"))
        return new Proxy({}, { get: (_, key) => String(key) });
      assert.fail(`Unexpected dependency: ${name} in ${file}`);
    },
  });
  return exports as T;
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
class FormDataStub {
  private fields: Record<string, unknown>;
  constructor(form: { fields: Record<string, unknown> }) {
    this.fields = { ...form.fields };
  }
  get(key: string) {
    return this.fields[key] ?? null;
  }
  getAll(key: string) {
    const value = this.fields[key];
    return value == null ? [] : Array.isArray(value) ? value : [value];
  }
  set(key: string, value: unknown) {
    this.fields[key] = value;
  }
  append(key: string, value: unknown) {
    this.fields[key] = [...this.getAll(key), value];
  }
}
type ActionHook = {
  pending: boolean;
  run(action: () => void | Promise<unknown>): Promise<void>;
  isBusy(): boolean;
};
function environment() {
  const slots: unknown[] = [],
    transitions: Promise<unknown>[] = [],
    navigation: string[] = [],
    notifications: string[] = [];
  let index = 0,
    formValues: Record<string, unknown> | null = null;
  const react = {
    useState(initial: unknown) {
      const position = index++;
      if (!(position in slots))
        slots[position] = typeof initial === "function" ? initial() : initial;
      return [
        slots[position],
        (value: unknown) => {
          slots[position] = typeof value === "function" ? value(slots[position]) : value;
        },
      ];
    },
    useRef(initial: unknown) {
      const position = index++;
      if (!(position in slots)) slots[position] = { current: initial };
      return slots[position];
    },
    useMemo: (fn: () => unknown) => fn(),
    useCallback: (fn: unknown) => fn,
    useEffect() {},
    useTransition() {
      const [pending, setPending] = react.useState(false);
      return [
        pending,
        (action: () => Promise<unknown>) => {
          (setPending as (value: boolean) => void)(true);
          transitions.push(
            Promise.resolve(action()).finally(() =>
              (setPending as (value: boolean) => void)(false),
            ),
          );
        },
      ];
    },
  };
  const dependencies: Record<string, unknown> = {
    react,
    "next/navigation": {
      useRouter: () => ({
        push: (s: string) => navigation.push(s),
        replace: (s: string) => navigation.push(s),
        refresh: () => navigation.push("refresh"),
        back: () => navigation.push("back"),
      }),
      usePathname: () => "/certificados",
      useSearchParams: () => new URLSearchParams("create=1"),
    },
    "next/link": { default: "Link" },
    sonner: {
      toast: {
        error: (s: string) => notifications.push(s),
        success: (s: string) => notifications.push(s),
        warning: (s: string) => notifications.push(s),
      },
    },
    "lucide-react": new Proxy({}, { get: (_, key) => String(key) }),
    "@bloqer/utils": utils,
    "@bloqer/validators": validators,
    "@bloqer/domain": domain,
    "@bloqer/services/certification-measurement-pure": { previewCertificationMeasurement },
    "@/lib/format-money": formatMoney,
    "@/lib/utils": { cn: (...parts: unknown[]) => parts.filter(Boolean).join(" ") },
    "@/features/budgets/components/budget-status-badge": {
      budgetStatusLabel: (value: string) => value,
    },
    "@/features/budgets/components/unit-select": { UnitSelect: "UnitSelect" },
    "@/features/documents": { DocumentUploadZone: "DocumentUploadZone" },
    "./subcontract-budget-hints": { SubcontractBudgetHints: "SubcontractBudgetHints" },
    "@/components/feedback/reason-action-button": { ReasonActionButton: "ReasonActionButton" },
    "@/components/ui/process-stepper": { ProcessStepper: "ProcessStepper" },
    "../lib/create-attachment-limits": attachmentLimits,
    "@/lib/searchable-options": {
      contactsToSearchableOptions: () => [],
      wbsToSearchableOptions: () => [],
      withNoneOption: (v: unknown) => v,
    },
    "react-hook-form": {
      useForm: (options: { defaultValues: Record<string, unknown> }) => {
        formValues ??= { ...options.defaultValues };
        return {
          register: (name: string) => ({ name, defaultValue: formValues![name] }),
          watch: (name: string) => formValues![name],
          setValue: (name: string, value: unknown) => {
            formValues![name] = value;
          },
          formState: { errors: {} },
          handleSubmit:
            (callback: (data: unknown) => unknown) =>
            (event: { preventDefault(): void; values?: Record<string, unknown> }) => {
              event.preventDefault();
              Object.assign(formValues!, event.values);
              return callback({ ...formValues });
            },
        };
      },
    },
    "@hookform/resolvers/zod": { zodResolver: () => ({}) },
  };
  const hook = load<{
    useOperationalAction(options?: {
      onPendingChange?: (p: boolean) => void;
      onError?: (e: string) => void;
    }): ActionHook;
  }>("../../../hooks/use-operational-action.ts", dependencies);
  dependencies["@/hooks/use-operational-action"] = hook;
  return {
    dependencies,
    hook,
    navigation,
    notifications,
    render<T>(component: () => T) {
      index = 0;
      return component();
    },
    async settle() {
      await Promise.all(transitions.splice(0));
    },
  };
}

const ids = {
  project: "11111111-1111-4111-8111-111111111111",
  otherProject: "22222222-2222-4222-8222-222222222222",
  cert: "33333333-3333-4333-8333-333333333333",
  line: "44444444-4444-4444-8444-444444444444",
  otherLine: "55555555-5555-4555-8555-555555555555",
  contract: "66666666-6666-4666-8666-666666666666",
  otherContract: "77777777-7777-4777-8777-777777777777",
};
class TestServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
function actionEnvironment() {
  const env = environment(),
    writes: Array<{ name: string; args: unknown[] }> = [],
    invalidated: string[] = [];
  const services: Record<string, unknown> = { ServiceError: TestServiceError };
  const cert = {
    id: ids.cert,
    projectId: ids.project,
    subcontractId: ids.contract,
    lines: [{ id: ids.line }],
  };
  const mutations = [
    "createCertification",
    "updateCertification",
    "issueCertification",
    "approveCertification",
    "rejectCertification",
    "cancelCertification",
    "addCertificationLine",
    "updateCertificationLine",
    "removeCertificationLine",
    "refreshPreviousQty",
    "saveCertificationMeasurement",
    "createSubcontract",
    "updateSubcontract",
    "updateSubcontractMeta",
    "activateSubcontract",
    "completeSubcontract",
    "cancelSubcontract",
    "createSubcontractCertification",
    "updateSubcontractCertification",
    "issueSubcontractCertification",
    "approveSubcontractCertification",
    "rejectSubcontractCertification",
    "cancelSubcontractCertification",
  ];
  for (const name of mutations)
    services[name] = async (...args: unknown[]) => {
      writes.push({ name, args });
      return { ...cert };
    };
  services.getCertificationById = async () => cert;
  services.getSubcontractById = async () => ({ id: ids.contract, projectId: ids.project });
  services.getSubcontractCertificationById = async () => cert;
  services.uploadDocument = async () => assert.fail("no uploads expected");
  const current = {
    session: { user: { id: "actor" } },
    tenantCtx: { tenantId: "tenant", companyId: "company", roles: ["OWNER"] },
  };
  Object.assign(env.dependencies, {
    "@bloqer/services": services,
    "@/lib/auth": { getCurrentUser: async () => current },
    "next/cache": { revalidatePath: (p: string) => invalidated.push(p) },
    "@/lib/revalidate-project-paths": {
      revalidateProjectCostAndFinancePaths: (p: string) => invalidated.push(`finance:${p}`),
    },
    "next/navigation": {
      redirect: (p: string) => {
        throw new Error(`REDIRECT:${p}`);
      },
    },
    crypto: { randomUUID: () => ids.line },
    "@/features/subcontracts/lib/create-attachment-limits": attachmentLimits,
  });
  return { ...env, services, current, cert, writes, invalidated };
}

test("certificate creation rejects a route/payload project mismatch before a write", async () => {
  const env = actionEnvironment();
  const actions = load<Record<string, (...args: unknown[]) => Promise<Record<string, unknown>>>>(
    "../../../app/(app)/proyectos/[id]/certificaciones/actions.ts",
    env.dependencies,
  );
  const result = await actions.createCertificationAction!(ids.otherProject, {
    projectId: ids.project,
    budgetId: ids.cert,
    periodStart: "2026-11-01",
    periodEnd: "2026-11-05",
  });
  assert.ok(result.error);
  assert.equal(env.writes.length, 0);
  assert.equal(env.invalidated.length, 0);
});

for (const name of [
  "issueCertificationAction",
  "approveCertificationAction",
  "rejectCertificationAction",
  "cancelCertificationAction",
  "refreshPreviousQtyAction",
]) {
  test(`${name} verifies the real document parent and invalidates its derived views`, async () => {
    const env = actionEnvironment(),
      actions = load<Record<string, (...args: unknown[]) => Promise<Record<string, unknown>>>>(
        "../../../app/(app)/proyectos/[id]/certificaciones/actions.ts",
        env.dependencies,
      );
    const invoke = (projectId: string) =>
      name === "refreshPreviousQtyAction"
        ? actions[name]!(projectId, ids.cert)
        : actions[name]!(ids.cert, projectId, "Audited reason");
    const denied = await invoke(ids.otherProject);
    assert.ok(denied.error);
    assert.equal(env.writes.length, 0);
    assert.equal(env.invalidated.length, 0);
    const result = await invoke(ids.project);
    assert.equal(result.ok, true);
    assert.equal(env.writes.length, 1);
    assert.ok(env.invalidated.includes(`/proyectos/${ids.project}/certificaciones/${ids.cert}`));
    assert.ok(env.invalidated.includes(`/proyectos/${ids.project}/reportes/certificaciones`));
    assert.ok(env.invalidated.includes(`/proyectos/${ids.project}/reportes/avances`));
    if (name === "cancelCertificationAction")
      assert.equal(env.writes[0]!.args[2], "Audited reason");
  });
}

test("certificate header and measurement edits reject mismatched project without stale invalidation", async () => {
  const env = actionEnvironment(),
    actions = load<Record<string, (...args: unknown[]) => Promise<Record<string, unknown>>>>(
      "../../../app/(app)/proyectos/[id]/certificaciones/actions.ts",
      env.dependencies,
    );
  assert.ok(
    (await actions.updateCertificationAction!(ids.cert, ids.otherProject, { notes: "keep" })).error,
  );
  assert.ok(
    (
      await actions.saveCertificationMeasurementAction!(ids.otherProject, {
        certificationId: ids.cert,
        rows: [{ wbsNodeId: ids.line, included: true, currentQty: "1.2345", physicalPct: "0" }],
      })
    ).error,
  );
  assert.equal(env.writes.length, 0);
  assert.equal(env.invalidated.length, 0);
  assert.equal(
    (await actions.updateCertificationAction!(ids.cert, ids.project, { notes: "" })).ok,
    true,
  );
  assert.ok(
    env.invalidated.includes(`/proyectos/${ids.project}/certificaciones/${ids.cert}/editar`),
  );
});

for (const method of ["updateCertificationLineAction", "removeCertificationLineAction"]) {
  test(`${method} rejects a line from another certificate before mutation`, async () => {
    const env = actionEnvironment(),
      actions = load<Record<string, (...args: unknown[]) => Promise<Record<string, unknown>>>>(
        "../../../app/(app)/proyectos/[id]/certificaciones/actions.ts",
        env.dependencies,
      );
    const result = await actions[method]!(ids.project, ids.cert, ids.otherLine, { currentQty: 1 });
    assert.ok(result.error);
    assert.equal(env.writes.length, 0);
    assert.equal(env.invalidated.length, 0);
    assert.equal(
      (await actions[method]!(ids.project, ids.cert, ids.line, { currentQty: 1 })).ok,
      true,
    );
    assert.equal(env.writes.length, 1);
  });
}

for (const name of [
  "activateSubcontractAction",
  "completeSubcontractAction",
  "cancelSubcontractAction",
]) {
  test(`${name} checks its route parent and refreshes list, detail and reports`, async () => {
    const env = actionEnvironment(),
      actions = load<Record<string, (...args: unknown[]) => Promise<Record<string, unknown>>>>(
        "../../../app/(app)/proyectos/[id]/subcontratos/actions.ts",
        env.dependencies,
      );
    assert.ok((await actions[name]!(ids.contract, ids.otherProject)).error);
    assert.equal(env.writes.length, 0);
    assert.equal((await actions[name]!(ids.contract, ids.project)).ok, true);
    assert.equal(env.writes.length, 1);
    assert.ok(env.invalidated.includes(`/proyectos/${ids.project}/subcontratos`));
    assert.ok(env.invalidated.includes(`/proyectos/${ids.project}/subcontratos/${ids.contract}`));
    assert.ok(env.invalidated.includes(`/proyectos/${ids.project}/reportes/subcontratos`));
  });
}

for (const name of [
  "issueSubcontractCertificationAction",
  "approveSubcontractCertificationAction",
  "rejectSubcontractCertificationAction",
  "cancelSubcontractCertificationAction",
]) {
  test(`${name} checks both real parents and invalidates the AP boundary`, async () => {
    const env = actionEnvironment(),
      actions = load<Record<string, (...args: unknown[]) => Promise<Record<string, unknown>>>>(
        "../../../app/(app)/proyectos/[id]/subcontratos/actions.ts",
        env.dependencies,
      );
    assert.ok((await actions[name]!(ids.cert, ids.otherContract, ids.project)).error);
    assert.ok((await actions[name]!(ids.cert, ids.contract, ids.otherProject)).error);
    assert.equal(env.writes.length, 0);
    assert.equal(
      (await actions[name]!(ids.cert, ids.contract, ids.project, "Motivo auditado")).ok,
      true,
    );
    assert.equal(env.writes.length, 1);
    assert.ok(env.invalidated.includes(`/proyectos/${ids.project}/facturas-proveedor`));
    assert.ok(
      env.invalidated.includes(
        `/proyectos/${ids.project}/subcontratos/${ids.contract}/certificaciones/${ids.cert}`,
      ),
    );
    if (name === "cancelSubcontractCertificationAction")
      assert.equal(env.writes[0]!.args[2], "Motivo auditado");
  });
}

function pageEnvironment() {
  const env = actionEnvironment();
  env.current.tenantCtx.roles = ["VIEWER"];
  env.dependencies["@/components/layout/page-shell"] = { PageShell: "PageShell" };
  env.dependencies["@/components/layout/project-page-header"] = {
    ProjectPageHeader: "ProjectPageHeader",
  };
  env.dependencies["@/features/subcontracts/components/subcontract-list-section"] = {
    SubcontractListSection: "SubcontractListSection",
  };
  Object.assign(env.services, {
    getProjectShellInfo: async () => ({ id: ids.project, status: "ACTIVE" }),
    listSubcontractsByProject: async () => [],
    getTenantModuleGate: async () => ({ isEnabled: () => false }),
  });
  env.dependencies["next/navigation"] = {
    redirect: (p: string) => {
      throw new Error(`REDIRECT:${p}`);
    },
    notFound: () => {
      throw new Error("NOT_FOUND");
    },
  };
  return env;
}
test("a read-only subcontract list does not advertise creation", async () => {
  const env = pageEnvironment(),
    { default: Page } = load<{ default(p: unknown): Promise<Element> }>(
      "../../../app/(app)/proyectos/[id]/subcontratos/page.tsx",
      env.dependencies,
    );
  const tree = await Page({ params: Promise.resolve({ id: ids.project }) });
  assert.ok(
    !nodes(tree).some((node) => node.props.href === `/proyectos/${ids.project}/subcontratos/nuevo`),
  );
});
for (const path of [
  "subcontratos/nuevo/page.tsx",
  "subcontratos/[subcontractId]/editar/page.tsx",
]) {
  test(`read-only direct ${path} returns to the document before loading edit options`, async () => {
    const env = pageEnvironment();
    env.dependencies["@/features/subcontracts"] = { SubcontractForm: "SubcontractForm" };
    env.dependencies["@bloqer/config"] = { isStorageConfigured: () => false };
    const prefix = path.includes("nuevo") ? "../actions" : "../../actions";
    env.dependencies[prefix] = {};
    const { default: Page } = load<{ default(p: unknown): Promise<Element> }>(
      `../../../app/(app)/proyectos/[id]/${path}`,
      env.dependencies,
    );
    await assert.rejects(
      () =>
        Page({
          params: Promise.resolve({ id: ids.project, subcontractId: ids.contract }),
          searchParams: Promise.resolve({}),
        }),
      /REDIRECT:/,
    );
    assert.equal(env.writes.length, 0);
  });
}

for (const scenario of [
  {
    name: "global context on a company project",
    currentCompanyId: null,
    resolvedCompanyId: "company-a",
  },
  {
    name: "global context on a shared project",
    currentCompanyId: null,
    resolvedCompanyId: "company-shared-default",
  },
  {
    name: "company context on a shared project",
    currentCompanyId: "company-b",
    resolvedCompanyId: "company-b",
  },
]) {
  test(`subcontract creation scopes hints and active-coverage exclusion to its resolved company: ${scenario.name}`, async () => {
    const env = pageEnvironment();
    Object.assign(env.current.tenantCtx, {
      roles: ["OWNER"],
      companyId: scenario.currentCompanyId,
    });
    env.dependencies["@/features/subcontracts"] = { SubcontractForm: "SubcontractForm" };
    env.dependencies["@bloqer/config"] = { isStorageConfigured: () => false };
    env.dependencies["../actions"] = {};
    let resolved = false;
    const calls: Array<{ name: string; args: unknown[] }> = [];
    const hints = [{ wbsNodeId: "own-or-shared-wbs", currency: "ARS" }];
    const wbsOptions = [{ id: "own-or-shared-wbs" }];
    env.services.getSubcontractFormWbsPickList = async (...args: unknown[]) => {
      calls.push({ name: "pick", args });
      await Promise.resolve();
      resolved = true;
      return { companyId: scenario.resolvedCompanyId, wbsOptions };
    };
    env.services.listSubcontractorContacts = async () => [];
    env.services.getWbsSubcontractBudgetHints = async (...args: unknown[]) => {
      assert.equal(resolved, true, "Resolve the form company before querying hints");
      calls.push({ name: "hints", args });
      return hints;
    };
    const { default: Page } = load<{ default(p: unknown): Promise<Element> }>(
      "../../../app/(app)/proyectos/[id]/subcontratos/nuevo/page.tsx",
      env.dependencies,
    );
    const tree = await Page({
      params: Promise.resolve({ id: ids.project }),
      searchParams: Promise.resolve({}),
    });
    const pickerContext = calls.find((call) => call.name === "pick")!.args[1] as {
      companyId: string | null;
    };
    const hintCall = calls.find((call) => call.name === "hints")!;
    const hintContext = hintCall.args[1] as {
      companyId: string;
      tenantId: string;
      actorUserId: string;
      roles: string[];
    };
    assert.equal(pickerContext.companyId, scenario.currentCompanyId);
    assert.equal(hintCall.args[0], ids.project);
    assert.equal(hintContext.companyId, scenario.resolvedCompanyId);
    assert.equal(hintContext.tenantId, env.current.tenantCtx.tenantId);
    assert.equal(hintContext.actorUserId, env.current.session.user.id);
    assert.deepEqual([...hintContext.roles], ["OWNER"]);
    assert.equal(
      (hintCall.args[2] as { excludeWithActiveContract: boolean }).excludeWithActiveContract,
      true,
    );
    const form = elements(tree, "SubcontractForm")[0]!;
    assert.equal(form.props.companyId, scenario.resolvedCompanyId);
    assert.equal(form.props.wbsOptions, wbsOptions);
    assert.equal(form.props.budgetHints, hints);
  });
}

test("subcontract creation without a resolved company never queries global hints", async () => {
  const env = pageEnvironment();
  env.current.tenantCtx.roles = ["OWNER"];
  env.dependencies["@/features/subcontracts"] = { SubcontractForm: "SubcontractForm" };
  env.dependencies["@bloqer/config"] = { isStorageConfigured: () => false };
  env.dependencies["../actions"] = {};
  env.services.getSubcontractFormWbsPickList = async () => {
    throw new TestServiceError("VALIDATION", "Elegí una empresa activa");
  };
  env.services.listSubcontractorContacts = async () => [];
  env.services.getWbsSubcontractBudgetHints = async () =>
    assert.fail("No form company means no company-scoped hints");
  const { default: Page } = load<{ default(p: unknown): Promise<Element> }>(
    "../../../app/(app)/proyectos/[id]/subcontratos/nuevo/page.tsx",
    env.dependencies,
  );
  const tree = await Page({
    params: Promise.resolve({ id: ids.project }),
    searchParams: Promise.resolve({}),
  });
  assert.equal(elements(tree, "SubcontractForm").length, 0);
  assert.ok(text(tree).includes("Elegí una empresa activa"));
});

function subcontractCertificatePageEnvironment() {
  const env = pageEnvironment();
  env.current.tenantCtx.roles = ["OWNER"];
  Object.assign(env.dependencies, {
    "@/lib/format": { formatDate: (value: unknown) => String(value) },
    "@bloqer/config": { isStorageConfigured: () => false },
    "@/features/documents": { EntityDocumentsPanel: "EntityDocumentsPanel" },
    "@/features/ap": { SupplierInvoiceStatusBadge: "SupplierInvoiceStatusBadge" },
    "@/features/subcontracts": {
      SubcontractCertificationForm: "SubcontractCertificationForm",
      SubcontractCertificationStatusBadge: "SubcontractCertificationStatusBadge",
    },
    "@/features/subcontracts/components/subcontract-action-button": {
      SubcontractActionButton: "SubcontractActionButton",
    },
    "@/components/feedback/action-error-banner": { ActionErrorBanner: "ActionErrorBanner" },
    "@/components/feedback/confirm-action-button": { ConfirmActionButton: "ConfirmActionButton" },
    "../../../actions": {},
  });
  env.services.listEntityDocuments = async () => [];
  env.services.getSubcontractById = async () => ({
    id: ids.contract,
    projectId: ids.project,
    status: "ACTIVE",
    currency: "USD",
    lines: [],
  });
  return env;
}

for (const successorCertificationId of [null, ids.line]) {
  test(`rejected subcontract certificate points to ${successorCertificationId ? "its existing replacement" : "a new replacement"}`, async () => {
    const env = subcontractCertificatePageEnvironment();
    env.services.getSubcontractCertificationById = async () => ({
      ...env.cert,
      status: "REJECTED",
      currency: "USD",
      totalAmount: "0",
      lines: [],
      successorCertificationId,
    });
    const { default: Page } = load<{ default(p: unknown): Promise<Element> }>(
      "../../../app/(app)/proyectos/[id]/subcontratos/[subcontractId]/certificaciones/[certId]/page.tsx",
      env.dependencies,
    );
    const tree = await Page({
      params: Promise.resolve({ id: ids.project, subcontractId: ids.contract, certId: ids.cert }),
      searchParams: Promise.resolve({}),
    });
    const link = elements(tree, "Link").find((node) => text(node).includes("versión"))!;
    assert.equal(text(link), successorCertificationId ? "Ver nueva versión" : "Nueva versión");
    assert.equal(
      link.props.href,
      successorCertificationId
        ? `/proyectos/${ids.project}/subcontratos/${ids.contract}/certificaciones/${successorCertificationId}`
        : `/proyectos/${ids.project}/subcontratos/${ids.contract}/certificaciones/nueva?replaces=${ids.cert}`,
    );
  });
}

for (const scenario of ["wrong parent", "existing successor"] as const) {
  test(`direct replacement route rejects stale or mismatched input: ${scenario}`, async () => {
    const env = subcontractCertificatePageEnvironment();
    env.services.getSubcontractCertificationById = async () => ({
      ...env.cert,
      status: "REJECTED",
      projectId: scenario === "wrong parent" ? ids.otherProject : ids.project,
      successorCertificationId: scenario === "existing successor" ? ids.line : null,
    });
    const { default: Page } = load<{ default(p: unknown): Promise<Element> }>(
      "../../../app/(app)/proyectos/[id]/subcontratos/[subcontractId]/certificaciones/nueva/page.tsx",
      env.dependencies,
    );
    await assert.rejects(
      () =>
        Page({
          params: Promise.resolve({ id: ids.project, subcontractId: ids.contract }),
          searchParams: Promise.resolve({ replaces: ids.cert }),
        }),
      scenario === "wrong parent"
        ? /NOT_FOUND/
        : new RegExp(
            `REDIRECT:/proyectos/${ids.project}/subcontratos/${ids.contract}/certificaciones/${ids.line}`,
          ),
    );
    assert.equal(env.writes.length, 0);
  });
}

test("unavailable AP source displays its reason instead of a false missing-invoice warning", async () => {
  const env = subcontractCertificatePageEnvironment();
  env.current.tenantCtx.roles = ["VIEWER"];
  env.services.getSubcontractCertificationById = async () => ({
    ...env.cert,
    status: "APPROVED",
    currency: "USD",
    totalAmount: "1.23",
    lines: [],
    settlementStatus: null,
    settlementUnavailableReason: "Cuentas por pagar restringidas",
    supplierInvoiceId: null,
  });
  const { default: Page } = load<{ default(p: unknown): Promise<Element> }>(
    "../../../app/(app)/proyectos/[id]/subcontratos/[subcontractId]/certificaciones/[certId]/page.tsx",
    env.dependencies,
  );
  const tree = await Page({
    params: Promise.resolve({ id: ids.project, subcontractId: ids.contract, certId: ids.cert }),
    searchParams: Promise.resolve({}),
  });
  assert.ok(text(tree).includes("Liquidación: No disponible"));
  assert.ok(text(tree).includes("Cuentas por pagar restringidas"));
  assert.ok(!text(tree).includes("sin factura proveedor vinculada"));
  assert.ok(text(tree).includes(formatMoney.formatMoneyAmount("1.23", "USD")));
});

const submit = (
  tree: Element,
  fields: Record<string, unknown> = {},
  values?: Record<string, unknown>,
) =>
  (elements(tree, "form")[0]!.props.onSubmit as (event: unknown) => void)({
    preventDefault() {},
    currentTarget: { fields },
    values,
  });
const click = (node: Element) => (node.props.onClick as () => unknown)();
const eventButton = (tree: Element, label: string) =>
  elements(tree, "Button").find((node) => text(node) === label)!;

test("shared operational action returns an awaitable outcome, locks before rerender and hides transport details", async () => {
  const env = environment(),
    request = deferred<void>(),
    errors: string[] = [],
    pending: boolean[] = [];
  const render = () =>
    env.render(() =>
      env.hook.useOperationalAction({
        onError: (e) => errors.push(e),
        onPendingChange: (p) => pending.push(p),
      }),
    );
  const action = render();
  let writes = 0,
    finished = false;
  const result = action
    .run(() => {
      writes++;
      return request.promise;
    })
    .then(() => {
      finished = true;
    });
  void action.run(async () => {
    writes++;
  });
  assert.equal(writes, 1);
  assert.equal(finished, false);
  assert.equal(action.isBusy(), true);
  request.reject(new Error("private secret database failure"));
  await result;
  await env.settle();
  assert.equal(finished, true);
  assert.equal(render().pending, false);
  assert.equal(errors.length, 1);
  assert.ok(!errors[0]!.includes("private"));
  assert.deepEqual(pending, [true, false]);
  await render().run(async () => {
    writes++;
  });
  await env.settle();
  assert.equal(writes, 2);
});

for (const kind of ["confirm", "reason"] as const) {
  test(`${kind} shared action keeps its confirmation open and guarded until server outcome, then allows a retry`, async () => {
    const env = environment(),
      request = deferred<{ ok: true }>(),
      name = kind === "confirm" ? "ConfirmActionButton" : "ReasonActionButton";
    const loaded = load<Record<string, (p: unknown) => Element>>(
      `../../../components/feedback/${kind}-action-button.tsx`,
      env.dependencies,
    );
    let writes = 0,
      succeeding = false;
    const reasons: string[] = [];
    const render = () =>
      env.render(() =>
        loaded[name]!({
          label: "Anular",
          title: "Anular documento",
          description: "Revisá el documento",
          requiresReason: true,
          action: (reason: string) => {
            writes++;
            reasons.push(reason);
            return succeeding ? Promise.resolve({ ok: true }) : request.promise;
          },
        }),
      );
    click(eventButton(render(), "Anular"));
    const dialogType = kind === "confirm" ? "ConfirmAlertDialog" : "ReasonAlertDialog",
      dialog = elements(render(), dialogType)[0]!;
    if (kind === "reason") assert.equal(dialog.props.minChars, 1);
    const invoke = () => (dialog.props.onConfirm as (reason: string) => Promise<void>)("motivo");
    const operation = invoke();
    void invoke();
    (dialog.props.onOpenChange as (open: boolean) => void)(false);
    assert.equal(writes, 1);
    assert.equal(elements(render(), dialogType)[0]!.props.open, true);
    assert.equal(elements(render(), dialogType)[0]!.props.pending, true);
    request.reject(new Error("private transport failure"));
    await operation;
    await env.settle();
    assert.equal(elements(render(), dialogType)[0]!.props.open, true);
    assert.ok(
      text(elements(render(), dialogType)[0]!.props.description).includes("No se pudo comprobar"),
    );
    succeeding = true;
    await (elements(render(), dialogType)[0]!.props.onConfirm as (reason: string) => Promise<void>)(
      "motivo",
    );
    await env.settle();
    assert.equal(elements(render(), dialogType)[0]!.props.open, false);
    assert.equal(writes, 2);
    assert.ok(env.navigation.includes("refresh"));
    if (kind === "reason") assert.deepEqual(reasons, ["motivo", "motivo"]);
  });
}

test("draft cancellation uses confirmation without imposing a reason field", async () => {
  const env = environment(),
    sent: string[] = [];
  const { ReasonActionButton } = load<{ ReasonActionButton(p: unknown): Element }>(
    "../../../components/feedback/reason-action-button.tsx",
    env.dependencies,
  );
  const tree = env.render(() =>
    ReasonActionButton({
      label: "Cancelar",
      title: "Cancelar",
      description: "Borrador",
      requiresReason: false,
      action: async (r: string) => {
        sent.push(r);
        return { ok: true };
      },
    }),
  );
  assert.equal(elements(tree, "ReasonAlertDialog").length, 0);
  await (elements(tree, "ConfirmAlertDialog")[0]!.props.onConfirm as () => Promise<void>)();
  await env.settle();
  assert.deepEqual(sent, [""]);
});

for (const editing of [false, true]) {
  test(`client certificate ${editing ? "editing" : "creation"} preserves data and pending state on transport failure`, async () => {
    const env = environment(),
      request = deferred<{ id: string }>(),
      payloads: unknown[] = [],
      pending: boolean[] = [];
    const name = editing ? "CertificationEditForm" : "CertificationForm";
    const loaded = load<Record<string, (p: unknown) => Element>>(
      `../components/certification-${editing ? "edit-form" : "form"}.tsx`,
      env.dependencies,
    );
    const data = {
      periodStart: "2026-11-01",
      periodEnd: "2026-11-05",
      notes: "Preserve",
      internalNotes: "Internal",
    };
    const props = {
      certId: "cert",
      projectId: "project",
      defaults: data,
      budgets: [{ id: "budget", name: "Main", versionNumber: 1, status: "APPROVED" }],
      onPendingChange: (p: boolean) => pending.push(p),
      onSubmit: (p: unknown) => {
        payloads.push(p);
        return request.promise;
      },
    };
    const render = () => env.render(() => loaded[name]!(props));
    const tree = render();
    submit(tree, {}, data);
    submit(tree, {}, data);
    assert.equal(payloads.length, 1);
    assert.equal(elements(render(), "fieldset")[0]!.props.disabled, true);
    request.reject(new Error("private transport"));
    await env.settle();
    assert.ok(text(render()).includes("No se pudo comprobar"));
    assert.equal(env.navigation.length, 0);
    assert.equal(elements(render(), "Textarea")[0]!.props.defaultValue, "Preserve");
    assert.deepEqual(pending, [true, false]);
  });
}

for (const editing of [false, true]) {
  test(`client certificate ${editing ? "edit" : "create"} success uses the canonical document route`, async () => {
    const env = environment(),
      name = editing ? "CertificationEditForm" : "CertificationForm";
    const loaded = load<Record<string, (p: unknown) => Element>>(
      `../components/certification-${editing ? "edit-form" : "form"}.tsx`,
      env.dependencies,
    );
    const tree = env.render(() =>
      loaded[name]!({
        certId: "saved",
        projectId: "project",
        defaults: {},
        budgets: [],
        onSubmit: async () => (editing ? { ok: true } : { id: "saved" }),
      }),
    );
    submit(tree);
    await env.settle();
    assert.ok(env.navigation.includes("/proyectos/project/certificaciones/saved"));
  });
}

function invoiceFromCertificateEnvironment(action: (...args: unknown[]) => unknown) {
  const env = environment();
  Object.assign(env.dependencies, {
    "@/features/finance/components/invoice-letter-fields": {
      InvoiceLetterSelect: "InvoiceLetterSelect",
      TaxRateSelect: "TaxRateSelect",
    },
    "@/features/finance/components/expandable-notes-field": {
      ExpandableNotesField: "ExpandableNotesField",
    },
    "@/features/finance/components/iibb-perception-fields": {
      IibbPerceptionFields: "IibbPerceptionFields",
    },
    "@/features/finance/components/document-class-badge": {
      DocumentClassCreateHint: "DocumentClassCreateHint",
    },
    "@/features/finance/components/manual-fx-field": { ManualFxField: "ManualFxField" },
    "@/app/(app)/proyectos/[id]/facturas/actions": { createInvoiceFromCertificationAction: action },
  });
  const { CertificationInvoiceForm } = load<{ CertificationInvoiceForm(p: unknown): Element }>(
    "../../sales-invoices/components/certification-invoice-form.tsx",
    env.dependencies,
  );
  return { ...env, CertificationInvoiceForm };
}

for (const failure of ["transport", "server"] as const) {
  test(`invoice from certificate preserves native FX/rates after ${failure} failure and locks submission/cancel before rerender`, async () => {
    const request = deferred<{ error: string }>(),
      sent: Array<{ projectId: string; input: Record<string, unknown> }> = [];
    let succeed = false;
    const env = invoiceFromCertificateEnvironment((projectId: unknown, input: unknown) => {
      sent.push({ projectId: String(projectId), input: input as Record<string, unknown> });
      return succeed ? Promise.resolve({ id: "saved-invoice" }) : request.promise;
    });
    const render = () =>
      env.render(() =>
        env.CertificationInvoiceForm({
          projectId: "project",
          cert: {
            id: "cert",
            code: "CERT-1",
            currency: "USD",
            totalAmount: "100.25",
            periodStart: "2026-11-01",
            periodEnd: "2026-11-05",
          },
          companyCountry: "AR",
          clientCountry: "AR",
          companyIvaCondition: "RESPONSIBLE_INSCRIPTO",
          clientIvaCondition: "RESPONSIBLE_INSCRIPTO",
        }),
      );
    const setValue = (type: string, key: string, value: string) =>
      (elements(render(), type)[0]!.props[key] as (value: string) => void)(value);
    setValue("ManualFxField", "onValueChange", "1234.567890");
    setValue("TaxRateSelect", "onValueChange", "10.5000");
    setValue("IibbPerceptionFields", "onRateChange", "4.1234");
    const tree = render();
    const fields = {
      issueDate: "2026-11-07",
      dueDate: "2026-12-08",
      notes: "Preserve document notes",
    };
    submit(tree, fields);
    submit(tree, fields);
    assert.equal(sent.length, 1);
    click(eventButton(tree, "Cancelar"));
    assert.equal(env.navigation.length, 0);
    (elements(tree, "ManualFxField")[0]!.props.onValueChange as (value: string) => void)("999");
    (elements(tree, "InvoiceLetterSelect")[0]!.props.onValueChange as (value: string) => void)("C");
    (elements(tree, "IibbPerceptionFields")[0]!.props.onRateChange as (value: string) => void)(
      "99",
    );
    assert.equal(elements(render(), "fieldset")[0]!.props.disabled, true);
    assert.equal(eventButton(render(), "Cancelar").props.disabled, true);
    assert.equal(elements(render(), "ExpandableNotesField")[0]!.props.disabled, true);
    assert.equal(elements(render(), "ManualFxField")[0]!.props.disabled, true);
    if (failure === "transport") request.reject(new Error("private transport failure"));
    else request.resolve({ error: "Revisá el documento antes de guardar" });
    await env.settle();
    assert.equal(env.navigation.length, 0);
    assert.ok(nodes(render()).some((node) => node.props.role === "alert"));
    assert.ok(
      text(render()).includes(
        failure === "transport" ? "No se pudo comprobar" : "Revisá el documento",
      ),
    );
    assert.ok(!text(render()).includes("private transport"));
    assert.equal(elements(render(), "ManualFxField")[0]!.props.value, "1234.567890");
    assert.equal(elements(render(), "IibbPerceptionFields")[0]!.props.rate, "4.1234");
    assert.equal(elements(render(), "TaxRateSelect")[0]!.props.value, "10.5000");
    assert.equal(elements(render(), "InvoiceLetterSelect")[0]!.props.value, "A");
    assert.equal(sent[0]!.projectId, "project");
    for (const [key, expected] of Object.entries({
      ...fields,
      certificationId: "cert",
      fxRate: "1234.567890",
      taxRate: "10.5000",
      iibbPerceptionRate: "4.1234",
      invoiceLetter: "A",
    }))
      assert.equal(sent[0]!.input[key], expected);
    succeed = true;
    submit(render(), fields);
    await env.settle();
    assert.equal(sent.length, 2);
    assert.deepEqual(env.navigation, ["/proyectos/project/facturas/saved-invoice"]);
  });
}

test("invoice from certificate keeps ARS FX omitted and the existing C-letter zero-IVA rule", async () => {
  let sent: Record<string, unknown> | undefined;
  const env = invoiceFromCertificateEnvironment((_projectId: unknown, input: unknown) => {
    sent = input as Record<string, unknown>;
    return Promise.resolve({ id: "ars-invoice" });
  });
  const render = () =>
    env.render(() =>
      env.CertificationInvoiceForm({
        projectId: "project",
        cert: { id: "cert", currency: "ARS", totalAmount: "100.00" },
        companyCountry: "AR",
        clientCountry: "AR",
        companyIvaCondition: "MONOTAX",
        clientIvaCondition: "RESPONSIBLE_INSCRIPTO",
      }),
    );
  (elements(render(), "TaxRateSelect")[0]!.props.onValueChange as (value: string) => void)(
    "21.0000",
  );
  submit(render(), { issueDate: "2026-11-05", dueDate: "2026-11-30" });
  await env.settle();
  assert.ok(sent);
  assert.equal(sent.fxRate, undefined);
  assert.equal(sent.invoiceLetter, "C");
  assert.equal(sent.taxRate, "0");
  assert.deepEqual(env.navigation, ["/proyectos/project/facturas/ars-invoice"]);
});

for (const mode of ["create", "edit"] as const) {
  test(`subcontract certificate ${mode} preserves four decimals, currency and absolute navigation`, async () => {
    const env = environment(),
      payloads: FormDataStub[] = [];
    const { SubcontractCertificationForm } = load<{
      SubcontractCertificationForm(p: unknown): Element;
    }>("../../subcontracts/components/subcontract-certification-form.tsx", env.dependencies);
    const props = {
      mode,
      projectId: "project",
      subcontractId: "contract",
      certificationId: "saved",
      currency: "USD",
      subcontractLines: [
        {
          id: "line",
          description: "Work",
          unit: "m2",
          quantity: "10",
          certifiedQuantity: "0",
          remainingQty: "10",
          unitPrice: "1.2550",
        },
      ],
      initialQuantities: { line: "1.2345" },
      action: async (fd: FormDataStub) => {
        payloads.push(fd);
        return mode === "edit" ? { ok: true } : { id: "saved" };
      },
    };
    const render = () => env.render(() => SubcontractCertificationForm(props));
    assert.equal(elements(render(), "DecimalInput")[0]!.props.precision, 4);
    assert.ok(text(render()).includes(formatMoney.formatMoneyAmount("1.55", "USD")));
    submit(render(), { periodStart: "2026-11-01", periodEnd: "2026-11-05", notes: "Keep" });
    await env.settle();
    assert.equal(JSON.parse(String(payloads[0]!.get("lines")))[0].currentQty, "1.2345");
    assert.ok(
      env.navigation.includes("/proyectos/project/subcontratos/contract/certificaciones/saved"),
    );
  });
}

test("subcontract certificate rejection preserves header/quantities and locks all controls before rerender", async () => {
  const env = environment(),
    request = deferred<{ error: string }>();
  let writes = 0;
  const { SubcontractCertificationForm } = load<{
    SubcontractCertificationForm(p: unknown): Element;
  }>("../../subcontracts/components/subcontract-certification-form.tsx", env.dependencies);
  const render = () =>
    env.render(() =>
      SubcontractCertificationForm({
        projectId: "p",
        subcontractId: "s",
        currency: "ARS",
        subcontractLines: [
          {
            id: "line",
            description: "Work",
            remainingQty: "5",
            quantity: "5",
            unitPrice: "10",
            certifiedQuantity: "0",
          },
        ],
        initialQuantities: { line: "1.2345" },
        action: () => {
          writes++;
          return request.promise;
        },
      }),
    );
  const tree = render();
  submit(tree, { notes: "Keep" });
  submit(tree, { notes: "Keep" });
  assert.equal(writes, 1);
  assert.equal(elements(render(), "fieldset")[0]!.props.disabled, true);
  assert.equal(eventButton(render(), "Cancelar").props.disabled, true);
  request.resolve({ error: "Saldo cambió" });
  await env.settle();
  assert.ok(text(render()).includes("Saldo cambió"));
  assert.equal(elements(render(), "DecimalInput")[0]!.props.value, "1.2345");
  assert.equal(env.navigation.length, 0);
});

test("subcontract editor preserves identity fields and computes native money only after multiplying precise quantities", async () => {
  const env = environment(),
    payloads: FormDataStub[] = [],
    request = deferred<{ error: string }>();
  const { SubcontractForm } = load<{ SubcontractForm(p: unknown): Element }>(
    "../../subcontracts/components/subcontract-form.tsx",
    env.dependencies,
  );
  const render = () =>
    env.render(() =>
      SubcontractForm({
        projectId: "p",
        companyId: "c",
        subcontractorOptions: [],
        wbsOptions: [],
        defaultValues: {
          subcontractorContactId: "supplier",
          currency: "USD",
          lines: [
            {
              wbsNodeId: "wbs",
              unit: "m2",
              description: "Work",
              quantity: "1.2345",
              unitPrice: "3.3333",
              notes: "",
            },
          ],
        },
        action: (fd: FormDataStub) => {
          payloads.push(fd);
          return request.promise;
        },
      }),
    );
  const tree = render();
  assert.equal(elements(tree, "CurrencySelect")[0]!.props.disabled, true);
  assert.equal(elements(tree, "SearchableCombobox")[0]!.props.disabled, true);
  assert.ok(text(tree).includes(formatMoney.formatMoneyAmount("4.11", "USD")));
  assert.ok(elements(tree, "DecimalInput").every((node) => node.props.precision === 4));
  submit(tree, { title: "Keep" });
  submit(tree, { title: "Keep" });
  assert.equal(payloads.length, 1);
  assert.equal(JSON.parse(String(payloads[0]!.get("lines")))[0].unitPrice, "3.3333");
  assert.equal(JSON.parse(String(payloads[0]!.get("lines")))[0].quantity, "1.2345");
  request.resolve({ error: "Revisá el subcontrato" });
  await env.settle();
  assert.ok(text(render()).includes("Revisá el subcontrato"));
  assert.equal(elements(render(), "DecimalInput")[0]!.props.value, "1.2345");
});

test("subcontract hint displays its source currency and permits only comparable picks", () => {
  const env = environment();
  const picked: string[] = [];
  const { SubcontractBudgetHints } = load<{ SubcontractBudgetHints(p: unknown): Element }>(
    "../../subcontracts/components/subcontract-budget-hints.tsx",
    env.dependencies,
  );
  const hints = ["USD", "ARS"].map((currency) => ({
    wbsNodeId: currency,
    name: currency,
    code: "1",
    unit: "m2",
    quantity: "2",
    budgetSubcontractTotal: "10",
    currency,
  }));
  const tree = env.render(() =>
    SubcontractBudgetHints({
      hints,
      currency: "ARS",
      onPick: (h: { currency: string }) => picked.push(h.currency),
    }),
  );
  const buttons = elements(tree, "Button");
  assert.equal(buttons[0]!.props.disabled, true);
  assert.equal(buttons[1]!.props.disabled, false);
  click(buttons[1]!);
  assert.deepEqual(picked, ["ARS"]);
  assert.ok(text(tree).includes("Moneda no comparable"));
  assert.ok(text(tree).includes(formatMoney.formatMoneyAmount("10", "USD")));
});

const row = {
  wbsNodeId: "wbs",
  code: "1",
  name: "Work",
  unit: "m2",
  budgetQty: "10",
  previousQty: "0",
  previousPhysicalPct: "0",
  remainingQty: "10",
  unitSalePrice: "1.2550",
  currentQty: "1.2345",
  physicalPct: "7.8912",
  lineId: "line",
  logQtyAcum: null,
  logPctAcum: null,
  logQtyPeriod: null,
  logPctPeriod: null,
  suggestions: [],
};
test("measurement keeps canonical strings and its revision, with no false zero for unavailable physical source", async () => {
  const env = environment(),
    request = deferred<{ error: string }>(),
    sent: Record<string, unknown>[] = [];
  const { CertificationMeasureForm } = load<{ CertificationMeasureForm(p: unknown): Element }>(
    "../components/certification-measure-form.tsx",
    env.dependencies,
  );
  const render = () =>
    env.render(() =>
      CertificationMeasureForm({
        sheet: {
          certificationId: "cert",
          revision: "revision",
          periodEnd: "2026-11-05",
          currency: "USD",
          costAvailable: false,
        },
        row,
        onSave: (data: Record<string, unknown>) => {
          sent.push(data);
          return request.promise;
        },
        onSaved() {
          assert.fail("must preserve rejected measurement");
        },
        onClose() {},
      }),
    );
  const tree = render();
  assert.ok(elements(tree, "DecimalInput").every((node) => node.props.precision === 4));
  assert.equal(
    nodes(tree).find((node) => node.props.label === "Libro acumulado al corte")!.props.value,
    "—",
  );
  click(eventButton(tree, "Guardar medición"));
  click(eventButton(tree, "Guardar medición"));
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.expectedRevision, "revision");
  const saved = (sent[0]!.rows as Array<Record<string, unknown>>)[0]!;
  assert.equal(saved.currentQty, "1.2345");
  assert.equal(saved.physicalPct, "7.8912");
  request.resolve({ error: "La medición cambió" });
  await env.settle();
  assert.ok(text(render()).includes("La medición cambió"));
  assert.equal(elements(render(), "DecimalInput")[0]!.props.value, "1.2345");
});

for (const kind of ["new", "header", "measurement"] as const) {
  test(`${kind} dialog cannot discard an in-flight operation, including before its pending rerender`, () => {
    const env = environment();
    let render: () => Element, childType: string;
    if (kind === "new") {
      env.dependencies["./certification-form"] = { CertificationForm: "CertificationForm" };
      const { NewCertificationDialog } = load<{ NewCertificationDialog(p: unknown): Element }>(
        "../components/new-certification-dialog.tsx",
        env.dependencies,
      );
      render = () =>
        env.render(() =>
          NewCertificationDialog({
            projectId: "p",
            defaultOpen: true,
            budgets: [{ id: "budget" }],
          }),
        );
      childType = "CertificationForm";
    } else if (kind === "header") {
      const loaded = load<{
        CertificationHeaderDialog(p: unknown): Element;
        CertificationEditForm: unknown;
      }>("../components/certification-edit-form.tsx", env.dependencies);
      render = () =>
        env.render(() =>
          loaded.CertificationHeaderDialog({
            projectId: "p",
            certId: "c",
            defaultOpen: true,
            defaults: {},
          }),
        );
      childType = "";
    } else {
      env.dependencies["../lib/measurement-tree"] = {
        buildMeasurementTree: () => [{ id: "wbs", isGroup: false, depth: 0 }],
      };
      env.dependencies["./certification-measure-form"] = {
        CertificationMeasureForm: "CertificationMeasureForm",
      };
      const { CertificationMeasurementWorksheet } = load<{
        CertificationMeasurementWorksheet(p: unknown): Element;
      }>("../components/certification-measurement-sheet.tsx", env.dependencies);
      render = () =>
        env.render(() =>
          CertificationMeasurementWorksheet({
            sheet: {
              rows: [row],
              groups: [],
              revision: "revision",
              sourceWarnings: ["Libro restringido"],
            },
            editable: true,
          }),
        );
      (elements(render(), "Dialog")[0]!.props.onOpenChange as (open: boolean) => void)(true);
      // The sheet opens a row via its render callback, not by opening an empty dialog.
      const slotEntry = nodes(render()).find((node) => node.props.onMeasure);
      if (slotEntry) (slotEntry.props.onMeasure as () => void)();
      childType = "CertificationMeasureForm";
      assert.ok(text(render()).includes("Libro restringido"));
    }
    const tree = render(),
      child = childType
        ? elements(tree, childType)[0]!
        : nodes(tree).find(
            (node) =>
              typeof node.type === "function" && Object.hasOwn(node.props, "onPendingChange"),
          )!;
    assert.ok(child);
    (child.props.onPendingChange as (pending: boolean) => void)(true);
    (elements(tree, "Dialog")[0]!.props.onOpenChange as (open: boolean) => void)(false);
    assert.equal(elements(render(), "Dialog")[0]!.props.open, true);
    assert.equal(elements(render(), "DialogContent")[0]!.props.closeButtonDisabled, true);
    (child.props.onPendingChange as (pending: boolean) => void)(false);
    (elements(render(), "Dialog")[0]!.props.onOpenChange as (open: boolean) => void)(false);
    assert.equal(elements(render(), "Dialog")[0]!.props.open, false);
  });
}

for (const status of ["DRAFT", "ISSUED", "APPROVED"] as const) {
  test(`client ${status} cancellation follows its existing reason requirement`, () => {
    const env = environment();
    const { CertificationTotalsPanel } = load<{ CertificationTotalsPanel(p: unknown): Element }>(
      "../components/certification-totals-panel.tsx",
      env.dependencies,
    );
    const tree = env.render(() =>
      CertificationTotalsPanel({
        status,
        currency: "ARS",
        totalAmount: "10",
        canEdit: true,
        canApprove: true,
      }),
    );
    assert.equal(elements(tree, "ReasonActionButton")[0]!.props.requiresReason, status !== "DRAFT");
  });
}

test("certificate lifecycle catches a transport failure and rejects duplicate dispatch before rerender", async () => {
  const env = environment(),
    request = deferred<{ ok: true }>();
  let writes = 0;
  const { CertificationTotalsPanel } = load<{ CertificationTotalsPanel(p: unknown): Element }>(
    "../components/certification-totals-panel.tsx",
    env.dependencies,
  );
  const render = () =>
    env.render(() =>
      CertificationTotalsPanel({
        status: "DRAFT",
        currency: "ARS",
        totalAmount: "10",
        canEdit: true,
        onIssue: () => {
          writes++;
          return request.promise;
        },
      }),
    );
  const tree = render();
  click(eventButton(tree, "Emitir certificación"));
  click(eventButton(tree, "Emitir certificación"));
  assert.equal(writes, 1);
  assert.equal(elements(render(), "ReasonActionButton")[0]!.props.disabled, true);
  request.reject(new Error("private lifecycle error"));
  await env.settle();
  assert.ok(text(render()).includes("No se pudo comprobar"));
  assert.equal(env.navigation.length, 0);
});

test("subcontract lifecycle preserves server and transport errors, blocks duplicate dispatch and refreshes only on success", async () => {
  const env = environment(),
    request = deferred<{ ok: true }>();
  let writes = 0,
    outcome = "transport";
  const { SubcontractActionButton } = load<{ SubcontractActionButton(p: unknown): Element }>(
    "../../subcontracts/components/subcontract-action-button.tsx",
    env.dependencies,
  );
  const render = () =>
    env.render(() =>
      SubcontractActionButton({
        label: "Activar",
        action: () => {
          writes++;
          return outcome === "transport"
            ? request.promise
            : outcome === "server"
              ? Promise.resolve({ error: "Revisá las líneas" })
              : Promise.resolve({ ok: true });
        },
      }),
    );
  const tree = render();
  click(eventButton(tree, "Activar"));
  click(eventButton(tree, "Activar"));
  assert.equal(writes, 1);
  assert.equal(elements(render(), "Button")[0]!.props.disabled, true);
  request.reject(new Error("private transport data"));
  await env.settle();
  assert.ok(text(render()).includes("No se pudo comprobar"));
  assert.equal(env.navigation.length, 0);
  outcome = "server";
  click(eventButton(render(), "Activar"));
  await env.settle();
  assert.ok(text(render()).includes("Revisá las líneas"));
  assert.equal(env.navigation.length, 0);
  outcome = "success";
  click(eventButton(render(), "Activar"));
  await env.settle();
  assert.deepEqual(env.navigation, ["refresh"]);
});

for (const scenario of [
  {
    name: "unavailable even after a partial collection",
    moneyVisible: true,
    invoice: { canCollect: false, isSettled: false, collectionStatusAvailable: false },
    collections: [{ id: "collection", accountName: "Synthetic account", amount: "1" }],
    state: "upcoming",
    label: "Saldo no disponible",
  },
  {
    name: "settled without a cash collection",
    moneyVisible: true,
    invoice: { canCollect: false, isSettled: true, collectionStatusAvailable: true },
    collections: [],
    state: "done",
    label: "Sin saldo pendiente",
  },
  {
    name: "still collectible",
    moneyVisible: true,
    invoice: { canCollect: true, isSettled: false, collectionStatusAvailable: true },
    collections: [],
    state: "current",
    label: "Cobrar",
  },
  {
    name: "related document remains outstanding",
    moneyVisible: true,
    invoice: { canCollect: false, isSettled: false, collectionStatusAvailable: true },
    collections: [],
    state: "current",
    label: "Saldo pendiente",
  },
  {
    name: "restricted AR source",
    moneyVisible: false,
    invoice: null,
    collections: [],
    state: "upcoming",
    label: "Cobranza restringida",
  },
]) {
  test(`financial trail uses service settlement evidence: ${scenario.name}`, () => {
    const env = environment();
    const { CertificationFlowTrail } = load<{ CertificationFlowTrail(p: unknown): Element }>(
      "../components/certification-flow-trail.tsx",
      env.dependencies,
    );
    const invoice = scenario.invoice
      ? { id: "invoice", code: "FAC-1", status: "ISSUED", receivableId: null, ...scenario.invoice }
      : null;
    const tree = CertificationFlowTrail({
      projectId: "project",
      status: "APPROVED",
      hasLines: true,
      currency: "ARS",
      moneyVisible: scenario.moneyVisible,
      invoice,
      collections: scenario.collections,
    });
    const steps = elements(tree, "ProcessStepper")[0]!.props.steps as Array<{
      id: string;
      state: string;
      label: string;
    }>;
    const collection = steps.find((step) => step.id === "cobrar")!;
    assert.equal(collection.state, scenario.state);
    assert.equal(collection.label, scenario.label);
    assert.ok(!text(tree).includes("Cobro registrado"));
    if (scenario.invoice?.isSettled) assert.ok(text(tree).includes("Sin saldo pendiente"));
    if (
      scenario.invoice?.collectionStatusAvailable &&
      !scenario.invoice.canCollect &&
      !scenario.invoice.isSettled
    )
      assert.ok(text(tree).includes("Saldo pendiente en documentos vinculados"));
    if (!scenario.moneyVisible)
      assert.ok(text(tree).includes("El estado financiero no se puede comprobar"));
  });
}
