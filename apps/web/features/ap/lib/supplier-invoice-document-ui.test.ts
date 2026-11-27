import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { runInNewContext } from "node:vm";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import * as domain from "@bloqer/domain";
import * as utils from "@bloqer/utils";
import type { SupplierInvoiceDocumentPreview } from "@bloqer/ai";
import * as money from "../../../lib/format-money";
import * as options from "../../../lib/searchable-options";
import * as costCategories from "../../../lib/cost-category-colors";
import type { InvoiceLine } from "../components/invoice-lines-editor";
import * as prefill from "./supplier-invoice-document-prefill";
import * as review from "./supplier-invoice-document-review";
import * as submission from "./supplier-invoice-draft-submission";

// Real component event handlers, pure helpers and mutation guard; no browser, DB or provider.
// This verifies transitions/recovery, not layout or physical-device behavior.
type Element = { type: string; props: Record<string, unknown> & {
  onClick: () => void;
  onSubmit: (event: unknown) => void;
  onChange: (value: unknown) => void;
  onValueChange: (value: string) => void;
  onFileSelect: (file: File) => void;
  onApply: (value: SupplierInvoiceDocumentPreview, file: File) => void;
  onIibbPerceptionRateChange: (value: string) => void;
  lines: InvoiceLine[];
} };
function elements(tree: unknown, type: string): Element[] {
  if (Array.isArray(tree)) return tree.flatMap((child) => elements(child, type));
  if (!tree || typeof tree !== "object" || !("props" in tree)) return [];
  const element = tree as Element;
  return [...(element.type === type ? [element] : []), ...Object.values(element.props).flatMap((child) => elements(child, type))];
}
function content(tree: unknown): string {
  if (Array.isArray(tree)) return tree.map(content).join("");
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  return tree && typeof tree === "object" && "props" in tree ? content((tree as Element).props.children) : "";
}
const named = (tree: unknown, type: string, label: string) => {
  const result = elements(tree, type).find((node) => content(node).includes(label));
  assert.ok(result, `${type}: ${label}`);
  return result;
};

function environment() {
  let index = 0;
  const slots: unknown[] = [], effects: Array<() => void> = [], jobs: Promise<unknown>[] = [], navigation: string[] = [];
  const react = {
    useState(initial: unknown) {
      const i = index++;
      if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
      return [slots[i], (value: unknown) => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }];
    },
    useRef(initial: unknown) { const i = index++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useMemo: (fn: () => unknown) => fn(), useCallback: (fn: unknown) => fn,
    useEffect(effect: () => void | (() => void), deps: unknown[]) {
      const i = index++, previous = slots[i] as { deps: unknown[]; cleanup?: () => void } | undefined;
      if (!previous || deps.some((value, j) => !Object.is(value, previous.deps[j]))) {
        const next = { deps, cleanup: previous?.cleanup };
        slots[i] = next;
        effects.push(() => { next.cleanup?.(); next.cleanup = effect() || undefined; });
      }
    },
    useTransition() {
      const [pending, setPending] = react.useState(false) as [boolean, (value: boolean) => void];
      return [pending, (work: () => Promise<unknown>) => { setPending(true); jobs.push(Promise.resolve(work()).finally(() => setPending(false))); }];
    },
  };
  const components = new Proxy({}, { get: (_, name) => String(name) });
  const dependencies: Record<string, unknown> = {
    react, "@bloqer/domain": domain, "@bloqer/utils": utils,
    "@/lib/format-money": money, "@/lib/searchable-options": options,
    "@/lib/utils": { cn: (...items: unknown[]) => items.filter(Boolean).join(" ") },
    "@/components/ui/decimal-input": { DecimalInput: "DecimalInput", reportInvalidDecimalInputs: () => true },
    "@/lib/cost-category-colors": costCategories,
    "@/lib/use-idempotency-key": { useIdempotencyKey: () => ({ idempotencyKey: "same-key", rotateIdempotencyKey() {} }) },
    "next/navigation": { useRouter: () => ({ push: (href: string) => navigation.push(href), back() {} }) },
    sonner: { toast: { success() {}, warning() {}, error() {} } },
    "../lib/supplier-invoice-document-prefill": prefill,
    "../lib/supplier-invoice-document-review": review,
    "../lib/supplier-invoice-draft-submission": submission,
  };
  const globals: Record<string, unknown> = { AbortController, FormData, File, crypto: { randomUUID }, URL: { createObjectURL: () => "blob:fixture", revokeObjectURL() {} } };
  function load<T>(path: string): T {
    const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const exports = {};
    const jsx = (type: string, props: Record<string, unknown>) => ({ type, props });
    runInNewContext(compiled, { exports, ...globals, require(name: string) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      if (name.startsWith("@/components/") || name.startsWith("@/features/") || name.startsWith("./") || name === "lucide-react") return components;
      assert.fail(`Unexpected dependency ${name}`);
    } });
    return exports as T;
  }
  dependencies["@/hooks/use-operational-action"] = load("../../../hooks/use-operational-action.ts");
  return { load, dependencies, globals, navigation,
    render<T>(component: () => T) { index = 0; const result = component(); effects.splice(0).forEach((run) => run()); return result; },
    async settle() { await Promise.all(jobs.splice(0)); await setImmediate(); },
  };
}

const preview: SupplierInvoiceDocumentPreview = {
  documentKind: "INVOICE", currency: "ARS", supplierName: "Proveedor fixture", supplierTaxId: null, fiscalReference: "FIXTURE",
  invoiceLetter: null, issueDate: null, dueDate: null, pricesIncludeTax: null,
  iibbPerceptionRate: null, iibbPerceptionAmount: null, subtotal: "100.00", taxTotal: null, total: "100.00",
  lines: [{ description: "Material", quantity: "1", unitPrice: "100", taxRate: null, discountPercent: null }],
  warnings: [], reviewReasons: ["Completá IVA e IIBB."], canApply: true, blockingReasons: [],
};

test("company capture: partial prefill requires completion/reconfirmation and retries only the saved draft's attachment", async () => {
  const env = environment(), creates: unknown[] = [], uploads: string[] = [];
  let uploadFails = true;
  env.globals.fetch = async () => ({ ok: true, json: async () => ({ enabled: true }) });
  env.globals.FormData = class { get(name: string) { return name === "issueDate" ? "2026-11-19" : name === "dueDate" ? "2026-12-19" : null; } };
  env.dependencies["@/app/(app)/proyectos/[id]/facturas-proveedor/actions"] = {};
  env.dependencies["@/app/(app)/finanzas/facturas-proveedor/actions"] = {
    createCompanySupplierInvoiceAction: async (input: unknown) => { creates.push(input); return { id: "saved-draft" }; },
  };
  env.dependencies["@/features/documents/lib/client-upload-document"] = {
    clientUploadDocument: async (input: { linkedEntityId: string }) => { uploads.push(input.linkedEntityId); return uploadFails ? { error: "Sin conexión" } : { id: "attachment" }; },
  };
  const { SupplierInvoiceForm } = env.load<{ SupplierInvoiceForm: (props: unknown) => Element }>("../components/supplier-invoice-form.tsx");
  const props = { companyFinanzas: true, companyCountry: "AR", storageConfigured: true, suppliers: [{ id: "supplier", label: "Proveedor", country: "AR" }] };
  const render = () => env.render(() => SupplierInvoiceForm(props));
  const submit = (tree: Element) => elements(tree, "form")[0]!.props.onSubmit({ preventDefault() {}, currentTarget: {} });
  render(); await env.settle();
  named(render(), "button", "Desde un comprobante").props.onClick();
  assert.equal(elements(render(), "fieldset")[1]!.props.disabled, true);
  submit(render()); assert.equal(creates.length, 0);
  const file = new File(["fixture"], "factura.pdf", { type: "application/pdf" });
  elements(render(), "DocumentUploadZone")[0]!.props.onFileSelect(file);
  elements(render(), "SupplierInvoiceDocumentAssistant")[0]!.props.onApply(preview, file);
  let tree = render();
  const editor = () => elements(render(), "InvoiceLinesEditor")[0]!;
  assert.equal(editor().props.lines[0]!.taxRate, "");
  assert.equal(editor().props.iibbPerceptionRate, "");
  assert.equal(editor().props.amountsPending, true);
  assert.equal(named(tree, "Button", "Guardar borrador").props.disabled, true);
  submit(tree); assert.equal(creates.length, 0);
  elements(tree, "SearchableCombobox").find((node) => node.props.id === "invoice-payee")!.props.onValueChange("supplier");
  elements(tree, "InvoiceLetterSelect")[0]!.props.onValueChange("A");
  for (const [id, value] of [["issueDate", "2026-11-19"], ["dueDate", "2026-12-19"]]) elements(tree, "Input").find((node) => node.props.id === id)!.props.onChange({ target: { value } });
  elements(tree, "Select")[0]!.props.onValueChange("net");
  editor().props.onIibbPerceptionRateChange("0");
  editor().props.onChange([{ ...editor().props.lines[0], taxRate: "0", discountPct: "0" }]);
  tree = render();
  const confirm = () => elements(render(), "input").find((node) => node.props.type === "checkbox")!;
  assert.equal(confirm().props.disabled, false);
  confirm().props.onChange({ target: { checked: true } });
  assert.equal(named(render(), "Button", "Guardar borrador").props.disabled, false);
  editor().props.onChange([{ ...editor().props.lines[0], unitPrice: "99" }]);
  assert.equal(confirm().props.checked, false);
  submit(render()); assert.equal(creates.length, 0);
  confirm().props.onChange({ target: { checked: true } });
  tree = render(); submit(tree); submit(tree); await env.settle();
  assert.equal(creates.length, 1);
  assert.deepEqual(uploads, ["saved-draft"]);
  assert.deepEqual(env.navigation, []);
  tree = render();
  assert.equal(elements(tree, "fieldset")[0]!.props.disabled, true);
  uploadFails = false;
  named(tree, "Button", "Reintentar adjunto").props.onClick(); await env.settle();
  assert.equal(creates.length, 1);
  assert.deepEqual(uploads, ["saved-draft", "saved-draft"]);
  assert.deepEqual(env.navigation, ["/finanzas/facturas-proveedor/saved-draft"]);
});

test("assistant: selection alone sends nothing, duplicate reads are blocked and a late cancelled response is discarded", async () => {
  const env = environment(), busy: boolean[] = [];
  let calls = 0, finish!: (response: unknown) => void;
  env.globals.fetch = () => { calls++; return new Promise((resolve) => { finish = resolve; }); };
  const { SupplierInvoiceDocumentAssistant } = env.load<{ SupplierInvoiceDocumentAssistant: (props: unknown) => Element }>("../components/supplier-invoice-document-assistant.tsx");
  const file = new File(["fixture"], "test.pdf", { type: "application/pdf" });
  const props = { file, originalUrl: "blob:fixture", disabled: false, onBusyChange: (value: boolean) => busy.push(value), onApply() { assert.fail("must not apply"); }, onManual() {} };
  const render = () => env.render(() => SupplierInvoiceDocumentAssistant(props));
  let tree = render(); assert.equal(calls, 0);
  named(tree, "Button", "Leer comprobante").props.onClick();
  named(tree, "Button", "Leer comprobante").props.onClick();
  assert.equal(calls, 1);
  tree = render(); named(tree, "Button", "Cancelar lectura").props.onClick();
  finish({ ok: true, json: async () => ({ preview }) }); await env.settle();
  assert.deepEqual(busy, [true, false]);
  assert.equal(elements(render(), "details").length, 0);
  assert.equal(named(render(), "Button", "Leer comprobante").props.disabled, false);
});

test("assistant: failed/incompatible reading retains a manual exit and partial data detail is collapsed", async () => {
  const env = environment();
  let manual = 0, applied = 0;
  env.globals.fetch = async () => ({ ok: true, json: async () => ({ preview }) });
  const { SupplierInvoiceDocumentAssistant } = env.load<{ SupplierInvoiceDocumentAssistant: (props: unknown) => Element }>("../components/supplier-invoice-document-assistant.tsx");
  let props = { file: new File(["fixture"], "test.heic", { type: "image/heic" }), originalUrl: null, disabled: false,
    onBusyChange() {}, onApply() { applied++; }, onManual() { manual++; } };
  const render = () => env.render(() => SupplierInvoiceDocumentAssistant(props));
  assert.equal(named(render(), "Button", "Leer comprobante").props.disabled, true);
  named(render(), "Button", "Continuar con carga manual").props.onClick(); assert.equal(manual, 1);
  props = { ...props, file: new File(["fixture"], "test.pdf", { type: "application/pdf" }) };
  render(); named(render(), "Button", "Leer comprobante").props.onClick(); await env.settle();
  assert.ok(elements(render(), "details").every((node) => !node.props.open));
  assert.equal(named(render(), "Button", "Usar datos y completar").props.disabled, true);
  elements(render(), "input")[0]!.props.onChange({ target: { checked: true } });
  named(render(), "Button", "Usar datos y completar").props.onClick(); assert.equal(applied, 1);
  // A different file cannot apply the previous preview, even before reset effects settle.
  props = { ...props, file: new File(["other"], "other.pdf", { type: "application/pdf" }) };
  assert.equal(elements(render(), "Button").some((node) => content(node).includes("Usar datos y completar")), false);
});

test("assisted line editor leaves new rows and unknown cost type empty instead of suggesting tax defaults", () => {
  const env = environment();
  const { InvoiceLinesEditor } = env.load<{ InvoiceLinesEditor: (props: unknown) => Element }>("../components/invoice-lines-editor.tsx");
  let lines: InvoiceLine[] = [{ description: "Material", quantity: "1", unitPrice: "100", taxRate: "", discountPct: "", costType: null }];
  const render = () => env.render(() => InvoiceLinesEditor({ lines, documentReview: true, amountsPending: true, requireWbs: true, onChange: (value: InvoiceLine[]) => { lines = value; } }));
  let tree = render();
  assert.equal(elements(tree, "Select")[0]!.props.value, "");
  assert.ok(elements(tree, "DecimalInput").filter((node) => node.props.id !== "invoice-header-discount").every((node) => node.props.required));
  assert.match(content(tree), /Por completar/);
  named(tree, "Button", "Agregar línea").props.onClick();
  assert.equal(lines.length, 2);
  assert.equal(lines[1]!.quantity, "");
  assert.equal(lines[1]!.taxRate, "");
  assert.equal(lines[1]!.discountPct, "");
  assert.equal(lines[1]!.costType, null);
  tree = render();
  assert.equal(elements(tree, "DocumentTaxTotalsFooter")[0]!.props.incomplete, true);
});

test("shared tax footer preserves missing IIBB only for assisted review and hides provisional amounts", () => {
  const env = environment();
  const { DocumentTaxTotalsFooter } = env.load<{ DocumentTaxTotalsFooter: (props: unknown) => Element }>("../../finance/components/iibb-perception-fields.tsx");
  const changes: string[] = [];
  const props = { subtotal: "100", taxAmount: "21", iibbPerceptionRate: "", onIibbPerceptionRateChange: (value: string) => changes.push(value) };
  let tree = DocumentTaxTotalsFooter({ ...props, incomplete: true, preserveEmptyRate: true });
  assert.match(content(tree), /Por completar/);
  assert.doesNotMatch(content(tree), /121/);
  const input = elements(tree, "DecimalInput")[0]!;
  assert.equal(input.props.required, true);
  assert.equal(input.props.precision, 4);
  input.props.onValueChange("");
  tree = DocumentTaxTotalsFooter(props);
  elements(tree, "DecimalInput")[0]!.props.onValueChange("");
  assert.deepEqual(changes, ["", "0"]);
});
