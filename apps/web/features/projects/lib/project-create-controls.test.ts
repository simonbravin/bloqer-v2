import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { can, type UserRole } from "@bloqer/domain";
import * as validators from "@bloqer/validators";

type Element = { type: string; props: Record<string, unknown> };
const jsx = (type: string, props: Record<string, unknown>): Element => ({ type, props });

function elements(tree: unknown, type: string): Element[] {
  if (Array.isArray(tree)) return tree.flatMap((node) => elements(node, type));
  if (!tree || typeof tree !== "object" || !("props" in tree)) return [];
  const node = tree as Element;
  return [...(node.type === type ? [node] : []), ...Object.values(node.props).flatMap((prop) => elements(prop, type))];
}

/** Execute maintained pages/components while replacing their I/O and rendering boundaries. */
function loadModule<T>(filename: string, dependencies: Record<string, unknown>): T {
  const compiled = ts.transpileModule(readFileSync(new URL(filename, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  runInNewContext(compiled, {
    exports,
    require: (name: string) => {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
      assert.ok(Object.hasOwn(dependencies, name), `Unmocked project page dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports as T;
}

class RedirectSignal extends Error {
  constructor(readonly href: string) { super(href); }
}

type PageModule = { default: (props?: unknown) => Promise<unknown> };

function projectPage(role: UserRole, enabled = true) {
  const reads = { contacts: 0, gates: 0, projects: 0 };
  const filters: Record<string, unknown>[] = [];
  const createProjectAction = async () => ({ id: "created-project" });
  const dependencies: Record<string, unknown> = {
    react: { Suspense: "suspense" },
    "next/link": { default: "link" },
    "next/navigation": { redirect: (href: string) => { throw new RedirectSignal(href); } },
    "@bloqer/domain": { can },
    "@bloqer/validators": validators,
    "@/lib/auth": {
      getCurrentUser: async () => ({
        session: { user: { id: "actor" } },
        tenantCtx: { tenantId: "tenant", companyId: "company", roles: [role] },
      }),
    },
    "@bloqer/services": {
      ServiceError: class extends Error {},
      listProjects: async (input: Record<string, unknown>) => { reads.projects++; filters.push(input); return { data: [], total: 0 }; },
      getTenantModuleGate: async () => {
        reads.gates++;
        return { isEnabled: (module: string) => module !== "PROJECTS" || enabled };
      },
      listAllContacts: async (filter: { role: string; status: string }, ctx: { tenantId: string }) => {
        reads.contacts++;
        assert.equal(filter.role, "CLIENT");
        assert.equal(filter.status, "ACTIVE");
        assert.equal(ctx.tenantId, "tenant");
        return [{ id: "client", legalName: "Cliente", fantasyName: undefined }];
      },
    },
    "../actions": { createProjectAction },
    "@/features/projects": {
      ProjectListSection: "project-list", ProjectFilters: "filters", ProjectListExportButton: "export", ProjectForm: "project-form",
    },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/list-view-toggle": { ListViewToggle: "view-toggle" },
    "@/components/ui/pagination": { Pagination: "pagination" },
    "@/components/layout/page-shell": { PageShell: "page-shell" },
    "@/components/ui/page-list-header": { PageListHeader: "page-header" },
    "@/components/ui/list-section-skeleton": { ListSectionSkeleton: "skeleton" },
  };
  return {
    reads,
    filters,
    createProjectAction,
    list: loadModule<PageModule>("../../../app/(app)/proyectos/page.tsx", dependencies).default,
    create: loadModule<PageModule>("../../../app/(app)/proyectos/nuevo/page.tsx", dependencies).default,
  };
}

test("project index hides creation from a viewer and passes the same capability to its list", async () => {
  for (const role of ["VIEWER", "OWNER"] as const) {
    const page = projectPage(role);
    const tree = await page.list({ searchParams: Promise.resolve({}) });
    const allowed = role === "OWNER";
    assert.equal(elements(tree, "link").some((node) => node.props.href === "/proyectos/nuevo"), allowed);
    assert.equal(elements(tree, "project-list")[0]!.props.canCreate, allowed);
    assert.equal(page.reads.projects, 1);
  }
});

test("project query values use a safe page and a documented status before reaching services", async () => {
  for (const invalidPage of ["NaN", "Infinity", "-1", "1.5", "9007199254740991", "1e100"]) {
    const page = projectPage("OWNER");
    await page.list({ searchParams: Promise.resolve({ page: invalidPage, status: "INVALID" }) });
    assert.equal(page.filters[0]!.page, 1);
    assert.equal(page.filters[0]!.status, undefined);
  }
  const valid = projectPage("OWNER");
  await valid.list({ searchParams: Promise.resolve({ page: "2", status: "ON_HOLD" }) });
  assert.equal(valid.filters[0]!.page, 2);
  assert.equal(valid.filters[0]!.status, "ON_HOLD");
});

test("successful project creation refreshes its layout, list and dashboard while failed creation does not", async () => {
  const invalidated: string[] = [];
  let fail = false;
  const actions = loadModule<{ createProjectAction: (input: unknown) => Promise<{ id?: string; error?: string }> }>("../../../app/(app)/proyectos/actions.ts", {
    "@bloqer/services": { createProject: async () => { if (fail) throw Error("private details"); return { id: "created-project" }; }, ServiceError: class extends Error {} },
    "@bloqer/validators": validators,
    "@/lib/auth": { getCurrentUser: async () => ({ session: { user: { id: "actor" } }, tenantCtx: { tenantId: "tenant", roles: ["OWNER"] } }) },
    "next/navigation": { redirect: () => { throw Error("Unexpected redirect"); } },
    "next/cache": { revalidatePath: (href: string, scope?: string) => invalidated.push(`${href}:${scope ?? "page"}`) },
  });
  const input = { code: "PRY", name: "Obra", clientContactId: "11111111-1111-4111-8111-111111111111", type: "PRIVATE" };
  assert.equal((await actions.createProjectAction(input)).id, "created-project");
  assert.deepEqual(invalidated, ["/proyectos/created-project:layout", "/proyectos:page", "/dashboard:page"]);
  invalidated.length = 0;
  fail = true;
  assert.equal((await actions.createProjectAction(input)).error, "Error inesperado al crear el proyecto");
  assert.deepEqual(invalidated, []);
});

test("new project route rejects a viewer or disabled PROJECTS before reading contact options", async () => {
  for (const { role, enabled, destination } of [
    { role: "VIEWER", enabled: true, destination: "/proyectos" },
    { role: "OWNER", enabled: false, destination: "/dashboard" },
  ] as const) {
    const page = projectPage(role, enabled);
    await assert.rejects(page.create(), (error: unknown) => error instanceof RedirectSignal && error.href === destination);
    assert.equal(page.reads.contacts, 0);
    assert.equal(page.reads.gates, role === "VIEWER" ? 0 : 1);
  }
});

test("an authorized owner reaches the creation form with only active client options", async () => {
  const page = projectPage("OWNER");
  const tree = await page.create();
  const form = elements(tree, "project-form")[0]!;
  assert.ok(form);
  assert.equal(page.reads.contacts, 1);
  assert.equal(page.reads.gates, 1);
  assert.equal(form.props.onSubmit, page.createProjectAction);
  const clients = form.props.clients as { id: string; fantasyName: string | null }[];
  assert.equal(clients[0]!.id, "client");
  assert.equal(clients[0]!.fantasyName, null);
});

test("switching list views preserves the explicit create capability", () => {
  for (const view of ["cards", "table"]) {
    const component = loadModule<{ ProjectListSection: (props: unknown) => Element }>("../components/project-list-section.tsx", {
      "@/components/ui/list-view-toggle": { useListViewMode: () => view },
      "./project-cards": { ProjectCards: "cards" },
      "./project-table": { ProjectTable: "table" },
    });
    for (const canCreate of [false, true]) {
      const tree = component.ProjectListSection({ projects: [], canCreate });
      assert.equal(tree.type, view);
      assert.equal(tree.props.canCreate, canCreate);
    }
  }
});

test("empty cards and tables offer creation only when explicitly allowed", () => {
  const dependencies: Record<string, unknown> = {
    react: { useMemo: (callback: () => unknown) => callback() },
    "next/link": { default: "link" },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/list-empty-state": { ListEmptyState: "empty-state" },
    "./project-status-badge": { ProjectStatusBadge: "status" },
    "@/components/ui/table": {},
    "@/components/ui/sortable-table-head": { SortableTableHead: "sort-head" },
    "@/components/ui/table-scroll": { TableScroll: "scroll" },
    "@/hooks/use-client-table-sort": { useClientTableSort: () => ({ sorted: [] }) },
  };
  const cards = loadModule<{ ProjectCards: (props: unknown) => unknown }>("../components/project-cards.tsx", dependencies);
  const table = loadModule<{ ProjectTable: (props: unknown) => unknown }>("../components/project-table.tsx", dependencies);
  for (const render of [cards.ProjectCards, table.ProjectTable]) {
    for (const canCreate of [false, true]) {
      const tree = render({ projects: [], canCreate });
      assert.equal(elements(tree, "link").some((node) => node.props.href === "/proyectos/nuevo"), canCreate);
    }
  }
});
