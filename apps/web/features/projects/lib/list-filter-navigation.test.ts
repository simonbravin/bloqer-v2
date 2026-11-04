import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

type Element = { type: string; props: Record<string, unknown> };
const jsx = (type: string, props: Record<string, unknown>) => ({ type, props });
function elements(tree: unknown, type: string): Element[] {
  if (Array.isArray(tree)) return tree.flatMap((node) => elements(node, type));
  if (!tree || typeof tree !== "object" || !("props" in tree)) return [];
  const node = tree as Element;
  return [...(node.type === type ? [node] : []), ...Object.values(node.props).flatMap((prop) => elements(prop, type))];
}

/** Actual filter bodies, controlled URL acknowledgments and debounce clock; no DOM or navigation I/O. */
function filters(kind: "directory" | "projects") {
  const pathname = kind === "directory" ? "/directorio" : "/proyectos";
  const filename = kind === "directory" ? "../../directory/components/contact-filters.tsx" : "../components/project-filters.tsx";
  const name = kind === "directory" ? "ContactFilters" : "ProjectFilters";
  const slots: unknown[] = [];
  let cursor = 0;
  let urlQuery = "page=4&other=preserved";
  let effectQueue: (() => void)[] = [];
  const timers = new Map<number, () => void>();
  let nextTimer = 1;
  const urls: string[] = [];
  const react = {
    useCallback: (callback: unknown) => callback,
    useRef(value: unknown) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: value };
      return slots[index];
    },
    useState(value: unknown) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = value;
      return [slots[index], (next: unknown) => { slots[index] = next; }];
    },
    useEffect(callback: () => void, deps: unknown[]) {
      const index = cursor++;
      const previous = slots[index] as unknown[] | undefined;
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous[i]))) {
        slots[index] = deps;
        effectQueue.push(callback);
      }
    },
  };
  const exports = {} as Record<string, () => unknown>;
  const compiled = ts.transpileModule(readFileSync(new URL(filename, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const dependencies: Record<string, unknown> = {
    react,
    "next/navigation": { useRouter: () => ({ replace: (href: string) => urls.push(href), push: (href: string) => urls.push(href) }), usePathname: () => pathname, useSearchParams: () => new URLSearchParams(urlQuery) },
    "@/components/ui/input": { Input: "input" },
    "@/components/ui/select": { Select: "select", SelectTrigger: "trigger", SelectContent: "content", SelectValue: "value", SelectItem: "option" },
  };
  runInNewContext(compiled, {
    exports, URLSearchParams,
    setTimeout: (callback: () => void) => { const id = nextTimer++; timers.set(id, callback); return id; },
    clearTimeout: (id: number) => timers.delete(id),
    require: (dependency: string) => {
      if (dependency === "react/jsx-runtime") return { jsx, jsxs: jsx };
      assert.ok(Object.hasOwn(dependencies, dependency), `Unmocked filter dependency: ${dependency}`);
      return dependencies[dependency];
    },
  });
  let tree: unknown;
  function render() {
    cursor = 0;
    tree = exports[name]!();
    const effects = effectQueue;
    effectQueue = [];
    effects.forEach((effect) => effect());
  }
  render();
  return {
    urls,
    status(value: string) {
      const selects = elements(tree, "select");
      (selects[kind === "directory" ? 1 : 0]!.props.onValueChange as (value: string) => void)(value);
      render();
    },
    role(value: string) {
      (elements(tree, "select")[0]!.props.onValueChange as (value: string) => void)(value);
      render();
    },
    search(value: string) {
      (elements(tree, "input")[0]!.props.onChange as (event: unknown) => void)({ target: { value } });
      render();
    },
    acknowledge(href: string) { urlQuery = new URL(href, "https://example.test").searchParams.toString(); render(); render(); },
    flushSearch() { const pending = [...timers.values()]; timers.clear(); pending.forEach((callback) => callback()); },
    searchValue: () => elements(tree, "input")[0]!.props.value,
    statusValue: () => elements(tree, "select")[kind === "directory" ? 1 : 0]!.props.value,
  };
}

for (const kind of ["directory", "projects"] as const) {
  const all = kind === "directory" ? "ALL" : "all";
  const active = kind === "directory" ? "ARCHIVED" : "ON_HOLD";
  test(`${kind}: status followed by typing before URL acknowledgment preserves both edits`, () => {
    const component = filters(kind);
    component.status(active);
    component.search(" 20876543210 ");
    // The slower response for the status alone must not discard the newer draft.
    component.acknowledge(component.urls[0]!);
    component.flushSearch();
    const final = new URL(component.urls.at(-1)!, "https://example.test");
    assert.equal(final.searchParams.get("status"), active);
    assert.equal(final.searchParams.get("search"), "20876543210");
    assert.equal(final.searchParams.get("other"), "preserved");
    assert.equal(final.searchParams.has("page"), false);
    assert.equal(component.searchValue(), " 20876543210 ");
  });

  test(`${kind}: typing then selecting status flushes the accumulated search without a stale timer`, () => {
    const component = filters(kind);
    component.search("Torre norte");
    component.status(active);
    component.flushSearch();
    assert.equal(component.urls.length, 1);
    const final = new URL(component.urls[0]!, "https://example.test");
    assert.equal(final.searchParams.get("search"), "Torre norte");
    assert.equal(final.searchParams.get("status"), active);
  });

  test(`${kind}: two statuses and search before URL updates keep the last choice including ALL`, () => {
    const component = filters(kind);
    component.status(active);
    component.status(all);
    component.search("Contacto");
    component.acknowledge(component.urls[0]!);
    component.flushSearch();
    const final = new URL(component.urls.at(-1)!, "https://example.test");
    assert.equal(final.searchParams.get("status"), kind === "directory" ? "ALL" : null);
    assert.equal(final.searchParams.get("search"), "Contacto");
    assert.equal(component.statusValue(), all);
  });

  test(`${kind}: external URL changes replace draft filters and cancel an unfinished search`, () => {
    const component = filters(kind);
    component.search("Unsent");
    component.acknowledge(`/${kind}?status=${active}&search=External`);
    component.flushSearch();
    assert.equal(component.urls.length, 0);
    assert.equal(component.searchValue(), "External");
    assert.equal(component.statusValue(), active);
  });
}

test("directory: role, ALL status and search compose before any route response", () => {
  const component = filters("directory");
  component.role("SUPPLIER");
  component.status("ALL");
  component.search("20876543210");
  component.flushSearch();
  const final = new URL(component.urls.at(-1)!, "https://example.test");
  assert.equal(final.searchParams.get("role"), "SUPPLIER");
  assert.equal(final.searchParams.get("status"), "ALL");
  assert.equal(final.searchParams.get("search"), "20876543210");
});
