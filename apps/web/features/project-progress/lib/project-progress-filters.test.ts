import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { computeDateRangePreset } from "@bloqer/utils";

type Element = { type: string; props: Record<string, unknown> };
const jsx = (type: string, props: Element["props"]): Element => ({ type, props });

function find(tree: unknown, match: (node: Element) => boolean): Element | undefined {
  if (Array.isArray(tree)) return tree.map((node) => find(node, match)).find(Boolean);
  if (!tree || typeof tree !== "object" || !("props" in tree)) return;
  const node = tree as Element;
  return match(node) ? node : find(node.props.children, match);
}

function environment() {
  const pathname = "/proyectos/proyecto/reportes/avances";
  const currentQuery = "budgetId=ars&currency=ARS&dateFrom=2026-10-01&dateTo=2026-11-01&page=4";
  const now = new Date("2026-11-09T03:00:00Z"); // Monday in the product timezone.
  const navigations: string[] = [];
  const state: unknown[] = [];
  let index = 0;
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: {
      useState(initial: unknown) {
        const slot = index++;
        state[slot] ??= initial;
        return [state[slot], (value: unknown) => { state[slot] = value; }];
      },
      useMemo: (fn: () => unknown) => fn(),
    },
    "next/navigation": {
      usePathname: () => pathname,
      useSearchParams: () => new URLSearchParams(currentQuery),
      useRouter: () => ({ push: (url: string) => navigations.push(url) }),
    },
    "next/link": { default: "Link" },
    "lucide-react": { SlidersHorizontal: "SlidersHorizontal" },
    "@bloqer/utils": { computeDateRangePreset: (id: Parameters<typeof computeDateRangePreset>[0], referenceDate = now) =>
      computeDateRangePreset(id, referenceDate) },
    "@/lib/utils": { cn: (...values: unknown[]) => values.filter(Boolean).join(" ") },
  };
  function load(file: string) {
    const { outputText } = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    });
    const exports: Record<string, (props: unknown) => Element> = {};
    runInNewContext(outputText, { exports, URLSearchParams, require(name: string) {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      assert.ok(name.startsWith("@/components/ui/"), name);
      return new Proxy({}, { get: (_, key) => String(key) });
    } });
    return exports;
  }
  const { DateRangePresets } = load("../../../components/ui/date-range-presets.tsx");
  const { ProjectProgressFilters } = load("../project-progress-filters.tsx");
  function renderFilters() {
    index = 0;
    return ProjectProgressFilters({
      budgets: [{ id: "ars", currency: "ARS" }, { id: "usd", currency: "USD" }],
      currencies: ["ARS", "USD"],
      budgetId: "ars",
      currency: "ARS",
      dateFrom: "2026-10-01",
      dateTo: "2026-11-01",
      maxDate: "2026-11-08",
    });
  }
  return { DateRangePresets, renderFilters, navigations, pathname };
}

test("report presets keep the draft budget and currency until Apply and respect a stale tab's cutoff", () => {
  const { DateRangePresets, renderFilters, navigations, pathname } = environment();
  const budget = find(renderFilters(), (node) => node.props.id === "progress-budget")!;
  (budget.props.onChange as (event: unknown) => void)({ target: { value: "usd" } });
  const presets = find(renderFilters(), (node) => node.type === "DateRangePresets")!;
  const week = find(DateRangePresets(presets.props), (node) => node.props.children === "Esta semana")!;
  (week.props.onClick as () => void)();
  assert.deepEqual(navigations, []);

  const draft = renderFilters();
  assert.equal(find(draft, (node) => node.props.id === "progress-budget")!.props.value, "usd");
  assert.equal(find(draft, (node) => node.props.id === "progress-currency")!.props.value, "USD");
  const updatedPresets = find(draft, (node) => node.type === "DateRangePresets")!;
  assert.equal(
    find(DateRangePresets(updatedPresets.props), (node) => node.props.children === "Esta semana")!.props["aria-pressed"],
    true,
  );
  const form = find(draft, (node) => node.type === "form")!;
  (form.props.onSubmit as (event: unknown) => void)({ preventDefault() {} });
  assert.deepEqual(navigations, [
    `${pathname}?dateFrom=2026-11-02&dateTo=2026-11-08&currency=USD&budgetId=usd`,
  ]);
});

test("URL-driven presets still apply immediately and clear the old page", () => {
  const { DateRangePresets, navigations, pathname } = environment();
  const week = find(DateRangePresets({}), (node) => node.props.children === "Esta semana")!;
  (week.props.onClick as () => void)();
  assert.deepEqual(navigations, [
    `${pathname}?budgetId=ars&currency=ARS&dateFrom=2026-11-09&dateTo=2026-11-09`,
  ]);
});
