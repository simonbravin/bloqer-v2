import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { can, formatIvaConditionLabel, type UserRole } from "@bloqer/domain";
import { serializeMoney } from "@bloqer/utils";
import * as validators from "@bloqer/validators";
import { activeContactRoles, contactRoleLabel } from "../types";

type Element = { type: string; props: Record<string, unknown> };
const jsx = (type: string, props: Record<string, unknown>): Element => ({ type, props });

function elements(tree: unknown, type: string): Element[] {
  if (Array.isArray(tree)) return tree.flatMap((node) => elements(node, type));
  if (!tree || typeof tree !== "object" || !("props" in tree)) return [];
  const node = tree as Element;
  if (node.type === "dialog" && !node.props.open) return [];
  return [...(node.type === type ? [node] : []), ...Object.values(node.props).flatMap((prop) => elements(prop, type))];
}

/** Execute actual modules with only network, framework rendering and session I/O replaced. */
function loadModule<T>(filename: string, dependencies: Record<string, unknown>): T {
  const compiled = ts.transpileModule(readFileSync(new URL(filename, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  runInNewContext(compiled, {
    exports, URLSearchParams,
    require: (name: string) => {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
      assert.ok(Object.hasOwn(dependencies, name), `Unmocked directory dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports as T;
}

class NavigationSignal extends Error {
  constructor(readonly destination: string) { super(destination); }
}
const contactId = "11111111-1111-4111-8111-111111111111";
type Page = { default: (props: Record<string, unknown>) => Promise<unknown> };

function pages(role: UserRole, enabled = true) {
  const reads = { list: 0, contact: 0, gate: 0 };
  const filters: Record<string, unknown>[] = [];
  const contact = {
    id: contactId, legalName: "Contacto", fantasyName: null, status: "ACTIVE", roles: [],
    country: "AR", taxIdType: "FOREIGN", ivaCondition: null,
    clientProfile: { paymentTermsDays: 0, defaultCurrency: "ARS", creditLimit: { toString: () => "1000.005" }, notes: null },
    supplierProfile: null, subcontractorProfile: null,
  };
  const dependencies = {
    react: { Suspense: "suspense" },
    "next/link": { default: "link" },
    "next/navigation": {
      redirect: (href: string) => { throw new NavigationSignal(href); },
      notFound: () => { throw new NavigationSignal("404"); },
    },
    "@bloqer/domain": { can, formatIvaConditionLabel },
    "@bloqer/utils": { serializeMoney },
    "@bloqer/validators": validators,
    "@/lib/auth": { getCurrentUser: async () => ({ session: { user: { id: "actor" } }, tenantCtx: { tenantId: "tenant", companyId: "company", roles: [role] } }) },
    "@bloqer/services": {
      ServiceError: class extends Error {},
      listContacts: async (input: Record<string, unknown>) => { reads.list++; filters.push(input); return { data: [], total: 0 }; },
      getContactById: async () => { reads.contact++; return contact; },
      getTenantModuleGate: async () => { reads.gate++; return { isEnabled: () => enabled }; },
    },
    "../actions": { createContactAction: "create-action" },
    "../../actions": { updateContactAction: "update-action" },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/list-view-toggle": { ListViewToggle: "view-toggle" },
    "@/components/ui/pagination": { Pagination: "pagination" },
    "@/components/layout/page-shell": { PageShell: "page-shell" },
    "@/components/ui/page-list-header": { PageListHeader: "page-header" },
    "@/components/ui/list-section-skeleton": { ListSectionSkeleton: "skeleton" },
    "@/components/ui/detail-field-grid": { DetailFieldGrid: "detail-grid", DetailField: "detail-field" },
    "@/features/directory/components/contact-form": { ContactForm: "contact-form" },
    "@/features/directory/components/contact-list-section": { ContactListSection: "contact-list" },
    "@/features/directory/components/contact-list-export-button": { ContactListExportButton: "export" },
    "@/features/directory/components/contact-filters": { ContactFilters: "filters" },
    "@/features/directory/components/role-manager": { RoleManager: "role-manager" },
    "@/features/directory/components/contact-archive-actions": { ContactArchiveActions: "archive-actions" },
    "@/features/directory/components/contact-status-badge": { ContactStatusBadge: "status-badge" },
  };
  return {
    reads,
    filters,
    list: loadModule<Page>("../../../app/(app)/directorio/page.tsx", dependencies).default,
    create: loadModule<Page>("../../../app/(app)/directorio/nuevo/page.tsx", dependencies).default,
    detail: loadModule<Page>("../../../app/(app)/directorio/[id]/page.tsx", dependencies).default,
    edit: loadModule<Page>("../../../app/(app)/directorio/[id]/editar/page.tsx", dependencies).default,
  };
}

test("directory list and empty state preserve the same create capability for owner and viewer", async () => {
  for (const role of ["OWNER", "VIEWER"] as const) {
    const page = pages(role);
    const tree = await page.list({ searchParams: Promise.resolve({}) });
    assert.equal(elements(tree, "link").some((node) => node.props.href === "/directorio/nuevo"), role === "OWNER");
    assert.equal(elements(tree, "contact-list")[0]!.props.canCreate, role === "OWNER");
    const { ContactListEmpty } = loadModule<{ ContactListEmpty: (props: unknown) => unknown }>("../components/contact-list-empty.tsx", {
      "next/link": { default: "link" }, "@/components/ui/button": { Button: "button" }, "@/components/ui/list-empty-state": { ListEmptyState: "empty" },
    });
    const empty = ContactListEmpty({ hasActiveFilters: false, canCreate: role === "OWNER" });
    assert.equal(elements(empty, "link").some((node) => node.props.href === "/directorio/nuevo?role=SUPPLIER"), role === "OWNER");
  }
});

test("direct contact creation and editing reject read-only access before offering a form", async () => {
  const viewer = pages("VIEWER");
  await assert.rejects(viewer.create({ searchParams: Promise.resolve({}) }), (err: unknown) => err instanceof NavigationSignal && err.destination === "/directorio");
  await assert.rejects(viewer.edit({ params: Promise.resolve({ id: contactId }) }), (err: unknown) => err instanceof NavigationSignal && err.destination === `/directorio/${contactId}`);
  assert.equal(viewer.reads.contact, 0);
  const disabled = pages("OWNER", false);
  await assert.rejects(disabled.create({ searchParams: Promise.resolve({}) }), (err: unknown) => err instanceof NavigationSignal && err.destination === "/dashboard");
  const owner = pages("OWNER");
  const tree = await owner.create({ searchParams: Promise.resolve({ role: "SUPPLIER" }) });
  assert.equal((elements(tree, "contact-form")[0]!.props.defaultValues as { initialRole: string }).initialRole, "SUPPLIER");
});

test("contact details keep profile values serializable and hide every editing entry for a viewer", async () => {
  for (const role of ["OWNER", "VIEWER"] as const) {
    const tree = await pages(role).detail({ params: Promise.resolve({ id: contactId }) });
    assert.equal(elements(tree, "link").some((node) => String(node.props.href).endsWith("/editar")), role === "OWNER");
    assert.equal(elements(tree, "archive-actions").length, role === "OWNER" ? 1 : 0);
    const manager = elements(tree, "role-manager")[0]!;
    assert.equal(manager.props.canEdit, role === "OWNER");
    assert.equal((manager.props.clientProfile as { creditLimit: string }).creditLimit, "1000.01");
  }
});

test("all-status filtering keeps status=ALL while role ALL clears only the role", () => {
  const replacements: string[] = [];
  const { ContactFilters } = loadModule<{ ContactFilters: () => unknown }>("../components/contact-filters.tsx", {
    react: { useCallback: (callback: unknown) => callback, useRef: (value: unknown) => ({ current: value }), useState: (value: unknown) => [value, () => undefined], useEffect: () => undefined },
    "next/navigation": { useRouter: () => ({ replace: (href: string) => replacements.push(href) }), usePathname: () => "/directorio", useSearchParams: () => new URLSearchParams("role=SUPPLIER&status=ARCHIVED&page=4") },
    "@/hooks/use-debounced-search-param": { useDebouncedSearchParam: () => ({ defaultValue: "", setDebounced: () => undefined }) },
    "@/components/ui/input": { Input: "input" },
    "@/components/ui/select": { Select: "select", SelectTrigger: "trigger", SelectValue: "value", SelectContent: "content", SelectItem: "option" },
  });
  const selects = elements(ContactFilters(), "select");
  (selects[1]!.props.onValueChange as (value: string) => void)("ALL");
  const allStatuses = new URL(replacements[0]!, "https://example.test");
  assert.equal(allStatuses.searchParams.get("status"), "ALL");
  assert.equal(allStatuses.searchParams.get("role"), "SUPPLIER");
  assert.equal(allStatuses.searchParams.has("page"), false);
  (selects[0]!.props.onValueChange as (value: string) => void)("ALL");
  const allRoles = new URL(replacements[1]!, "https://example.test");
  assert.equal(allRoles.searchParams.has("role"), false);
  assert.equal(allRoles.searchParams.get("status"), "ALL");
});

test("contact profile mutations invalidate details, edit and downstream selection surfaces", async () => {
  const invalidated: string[] = [];
  const action = loadModule<{ updateSupplierProfileAction: (id: string, input: unknown) => Promise<unknown> }>("../../../app/(app)/directorio/actions.ts", {
    "@bloqer/services": { updateSupplierProfile: async () => undefined, ServiceError: class extends Error {} },
    "@bloqer/validators": validators,
    "@/lib/auth": { getCurrentUser: async () => ({ session: { user: { id: "actor" } }, tenantCtx: { tenantId: "tenant", roles: ["OWNER"] } }) },
    "next/navigation": { redirect: () => { throw Error("Unexpected redirect"); } },
    "next/cache": { revalidatePath: (href: string, scope?: string) => invalidated.push(`${href}:${scope ?? "page"}`) },
  });
  await action.updateSupplierProfileAction(contactId, { notes: "" });
  assert.ok(invalidated.includes(`/directorio/${contactId}:layout`));
  assert.ok(invalidated.includes("/directorio:page"));
  assert.ok(invalidated.includes("/proyectos:layout"));
  assert.ok(invalidated.includes("/finanzas/transacciones:page"));
});

test("directory CSV labels its page scope and exports only active roles in Spanish", () => {
  const { ContactListExportButton } = loadModule<{ ContactListExportButton: (props: unknown) => Element }>("../components/contact-list-export-button.tsx", {
    "@/components/ui/export-csv-button": { ExportCsvButton: "export" },
    "@/features/directory/types": { activeContactRoles, contactRoleLabel },
  });
  const tree = ContactListExportButton({ contacts: [{ legalName: "Contacto", status: "ACTIVE", roles: [{ role: "SUPPLIER", status: "ACTIVE" }, { role: "CLIENT", status: "INACTIVE" }] }] });
  assert.equal(tree.props.label, "Exportar página CSV");
  assert.equal((tree.props.rows as string[][])[0]![4], "Proveedor");
});

test("directory pages normalize unsafe page offsets and keep explicit ALL and archived status filters", async () => {
  for (const invalidPage of ["NaN", "Infinity", "-1", "1.5", "9007199254740991", "1e100"]) {
    const page = pages("OWNER");
    await page.list({ searchParams: Promise.resolve({ page: invalidPage, status: "ALL" }) });
    assert.equal(page.filters[0]!.page, 1);
    assert.equal(page.filters[0]!.status, undefined);
  }
  const archived = pages("OWNER");
  await archived.list({ searchParams: Promise.resolve({ page: "2", status: "ARCHIVED" }) });
  assert.equal(archived.filters[0]!.page, 2);
  assert.equal(archived.filters[0]!.status, "ARCHIVED");
});

test("contact form reports fiscal input errors on the field and prevents duplicate saving while allowing retry", async () => {
  let data: Record<string, unknown> = { legalName: "Contacto", initialRole: "CLIENT", taxIdType: "CUIT", taxId: "123" };
  const errors: { field: string; message: string }[] = [];
  const payloads: Record<string, unknown>[] = [];
  const pushed: string[] = [];
  const submitting = { current: false };
  let rejectSave!: (reason: Error) => void;
  let shouldReject = true;
  const { ContactForm } = loadModule<{ ContactForm: (props: unknown) => unknown }>("../components/contact-form.tsx", {
    react: { useRef: () => submitting },
    "react-hook-form": { useForm: () => ({ control: {}, formState: { errors: {} }, setError: (field: string, error: { message: string }) => errors.push({ field, message: error.message }), handleSubmit: (callback: (input: unknown) => Promise<void>) => () => callback(data) }) },
    "@hookform/resolvers/zod": { zodResolver: () => undefined },
    "@bloqer/validators": validators,
    "next/navigation": { useRouter: () => ({ push: (href: string) => pushed.push(href) }) },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/input": { Input: "input" },
    "@/components/ui/textarea": { Textarea: "textarea" },
    "@/components/ui/form": { Form: "form-provider", FormControl: "form-control", FormDescription: "description", FormField: "form-field", FormItem: "form-item", FormLabel: "form-label", FormMessage: "form-message" },
    "@/components/ui/select": { Select: "select", SelectContent: "content", SelectItem: "option", SelectTrigger: "trigger", SelectValue: "value" },
    "@/features/finance/components/invoice-letter-fields": { IvaConditionSelect: "iva-select" },
  });
  const tree = ContactForm({ onSubmit: (input: Record<string, unknown>) => {
    payloads.push(input);
    return shouldReject ? new Promise((_resolve, reject) => { rejectSave = reject; }) : Promise.resolve({ id: contactId });
  } });
  const submit = elements(tree, "form")[0]!.props.onSubmit as () => Promise<void>;
  await submit();
  assert.equal(errors[0]!.field, "taxId");
  assert.equal(payloads.length, 0);
  data = { ...data, taxId: "20-12345678-9" };
  const saving = submit();
  await submit();
  assert.equal(payloads.length, 1);
  assert.equal(payloads[0]!.taxId, "20123456789");
  rejectSave(new Error("private details"));
  await saving;
  assert.equal(errors.at(-1)!.field, "root");
  assert.equal(errors.at(-1)!.message, "Error inesperado al guardar");
  assert.deepEqual(pushed, []);
  shouldReject = false;
  await submit();
  assert.equal(payloads.length, 2);
  assert.deepEqual(pushed, [`/directorio/${contactId}`]);
  const iva = elements(tree, "form-field").find((node) => node.props.name === "ivaCondition")!;
  const field = { name: "ivaCondition", ref: () => undefined, onBlur: () => undefined, onChange: () => undefined, value: "RI" };
  const rendered = (iva.props.render as (props: unknown) => unknown)({ field });
  const select = elements(rendered, "iva-select")[0]!;
  assert.equal(select.props.ref, field.ref);
  assert.equal(select.props.onBlur, field.onBlur);
  assert.equal(select.props.name, field.name);
});
