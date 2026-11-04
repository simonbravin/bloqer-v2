import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as domain from "@bloqer/domain";
import * as money from "@bloqer/utils";
import { budgetProjectReadOnlyReason } from "./budget-project-read-only";

type Element = { type: string; props: Record<string, unknown> };
const jsx = (type: string, props: Record<string, unknown>): Element => ({ type, props });
function elements(tree: unknown, type: string): Element[] {
  if (Array.isArray(tree)) return tree.flatMap((node) => elements(node, type));
  if (!tree || typeof tree !== "object" || !("props" in tree)) return [];
  const node = tree as Element;
  return [...(node.type === type ? [node] : []), ...Object.values(node.props).flatMap((prop) => elements(prop, type))];
}
function load<T>(filename: string, dependencies: Record<string, unknown>): T {
  const code = ts.transpileModule(readFileSync(new URL(filename, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  runInNewContext(code, { exports, require: (name: string) => {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
    assert.ok(Object.hasOwn(dependencies, name), `Unmocked page dependency: ${name}`);
    return dependencies[name];
  } });
  return exports as T;
}
const current = (role: string) => ({ session: { user: { id: "actor" } }, tenantCtx: { tenantId: "tenant", companyId: "company", roles: [role] } });
const navigation = { redirect: (path: string) => { throw new Error(`redirect:${path}`); }, notFound: () => { throw new Error("not-found"); } };
class ServiceError extends Error { constructor(readonly code: string, message: string) { super(message); } }
type Page = (props: unknown) => Promise<Element>;

function common(role: string) {
  return {
    "@bloqer/domain": domain,
    "@bloqer/utils": money,
    "@/lib/auth": { getCurrentUser: async () => current(role) },
    "@/features/budgets/lib/budget-project-read-only": { budgetProjectReadOnlyReason },
    "next/navigation": navigation,
    "next/link": { default: "link" },
    react: { Suspense: "suspense" },
    "@/components/ui/button": { Button: "button" },
    "@/components/layout/page-shell": { PageShell: "page-shell" },
    "@/components/layout/project-page-header": { ProjectPageHeader: "header" },
  };
}

test("read-only users cannot open the budget creation route directly", async () => {
  let reads = 0;
  const { default: Page } = load<{ default: Page }>("../../../app/(app)/proyectos/[id]/presupuestos/nuevo/page.tsx", {
    ...common("VIEWER"),
    "@/features/budgets": { BudgetForm: "budget-form" },
    "@bloqer/services": { ServiceError, getProjectShellInfo: async () => { reads++; }, listBudgetsByProject: async () => { reads++; return []; } },
    "../actions": { createBudgetAction() {}, executeWbsImportOnCreateAction() {} },
  });
  await assert.rejects(Page({ params: Promise.resolve({ id: "project" }), searchParams: Promise.resolve({}) }), /redirect:\/proyectos\/project\/presupuestos/);
  assert.equal(reads, 0);
});

test("budget creation translates service access failures into navigation instead of a server exception", async () => {
  const { default: Page } = load<{ default: Page }>("../../../app/(app)/proyectos/[id]/presupuestos/nuevo/page.tsx", {
    ...common("OWNER"),
    "@/features/budgets": { BudgetForm: "budget-form" },
    "@bloqer/services": { ServiceError, getProjectShellInfo: async () => ({ status: "ACTIVE" }), listBudgetsByProject: async () => { throw new ServiceError("FORBIDDEN", "Módulo deshabilitado"); } },
    "../actions": { createBudgetAction() {}, executeWbsImportOnCreateAction() {} },
  });
  await assert.rejects(Page({ params: Promise.resolve({ id: "project" }), searchParams: Promise.resolve({}) }), /redirect:\/dashboard/);
});

for (const role of ["OWNER", "VIEWER"]) {
  test(`budget list respects ${role} creation permissions in header and empty states`, async () => {
    const { default: Page } = load<{ default: Page }>("../../../app/(app)/proyectos/[id]/presupuestos/page.tsx", {
      ...common(role),
      "@/features/budgets": { BudgetListSection: "budget-list" },
      "@bloqer/services": { ServiceError, getProjectShellInfo: async () => ({ status: "ACTIVE" }), listBudgetsByProject: async () => [] },
      "@/components/ui/list-view-toggle": { ListViewToggle: "view-toggle" },
      "@/components/ui/list-section-skeleton": { ListSectionSkeleton: "skeleton" },
    });
    const tree = await Page({ params: Promise.resolve({ id: "project" }) });
    assert.equal(elements(tree, "button").length, role === "OWNER" ? 1 : 0);
    assert.equal(elements(tree, "budget-list")[0]!.props.canCreate, role === "OWNER");
  });
}

for (const status of ["ON_HOLD", "COMPLETED", "CANCELLED"]) {
  test(`budget planning is read-only for ${status} projects, including the direct creation route`, async () => {
    const services = { ServiceError, getProjectShellInfo: async () => ({ status }), listBudgetsByProject: async () => [] };
    const { default: NewPage } = load<{ default: Page }>("../../../app/(app)/proyectos/[id]/presupuestos/nuevo/page.tsx", {
      ...common("OWNER"), "@bloqer/services": services,
      "@/features/budgets": { BudgetForm: "budget-form" },
      "../actions": { createBudgetAction() {}, executeWbsImportOnCreateAction() {} },
    });
    await assert.rejects(NewPage({ params: Promise.resolve({ id: "project" }), searchParams: Promise.resolve({}) }), /redirect:\/proyectos\/project\/presupuestos/);
    const { default: ListPage } = load<{ default: Page }>("../../../app/(app)/proyectos/[id]/presupuestos/page.tsx", {
      ...common("OWNER"), "@bloqer/services": services,
      "@/features/budgets": { BudgetListSection: "budget-list" },
      "@/components/ui/list-view-toggle": { ListViewToggle: "view-toggle" },
      "@/components/ui/list-section-skeleton": { ListSectionSkeleton: "skeleton" },
    });
    const tree = await ListPage({ params: Promise.resolve({ id: "project" }) });
    assert.equal(elements(tree, "button").length, 0);
    assert.equal(elements(tree, "budget-list")[0]!.props.canCreate, false);
    assert.equal(elements(tree, "p")[0]!.props.role, "status");
  });
}

test("JSON budget export keeps authenticated data out of shared/browser caches", async () => {
  const payload = { rows: [{ name: "Partida", totalSalePrice: "0.04" }] };
  const calls: unknown[][] = [];
  const { GET } = load<{ GET: (request: unknown, context: unknown) => Promise<{ data: unknown; options: { headers: Record<string, string> } }> }>("../../../app/api/reports/proyectos/[projectId]/presupuestos/[budgetId]/export/route.ts", {
    "next/server": { NextResponse: { json: (data: unknown, options: unknown) => ({ data, options }) } },
    "@bloqer/services": { parseBudgetWbsExportFilters: () => ({ base: "cost" }), buildBudgetWbsExportPayload: async (...args: unknown[]) => { calls.push(args); return payload; } },
    "@bloqer/report-pdf": {},
    "@/lib/report-export-http": { requireReportExportContext: async () => ({ ok: true, ctx: { actorUserId: "actor" } }), searchParamsRecord: () => ({ format: "json" }), reportExportErrorResponse: () => { throw new Error("Unexpected export error"); } },
  });
  const response = await GET({}, { params: Promise.resolve({ projectId: "project", budgetId: "budget" }) });
  assert.equal(response.data, payload);
  assert.equal(response.options.headers["Cache-Control"], "private, no-store");
  assert.equal(calls[0]![0], "budget");
  assert.equal(calls[0]![1], "project");
});
