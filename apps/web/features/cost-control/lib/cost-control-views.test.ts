import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { addDecimal, compareDecimal } from "@bloqer/utils";
import * as formatting from "../../../lib/format-money";
import type { CostControlRow, CostControlTotals, WbsItemCostDetail } from "@bloqer/services";
import { ZodError } from "zod";

type Element = { type: string | ((props: Record<string, unknown>) => unknown); props: Record<string, unknown> };
const jsx = (type: Element["type"], props: Record<string, unknown>) => ({ type, props });
function nodes(tree: unknown, type: string): Element[] {
  if (Array.isArray(tree)) return tree.flatMap((child) => nodes(child, type));
  if (!tree || typeof tree !== "object" || !("props" in tree)) return [];
  const node = tree as Element;
  if (typeof node.type === "function") return nodes(node.type(node.props), type);
  return [...(node.type === type ? [node] : []), ...Object.values(node.props).flatMap((child) => nodes(child, type))];
}
function text(tree: unknown): string {
  if (typeof tree === "number" || typeof tree === "string") return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join("");
  if (!tree || typeof tree !== "object" || !("props" in tree)) return "";
  const node = tree as Element;
  return typeof node.type === "function" ? text(node.type(node.props)) : text(node.props.children);
}
function module<T>(name: string, extra: Record<string, unknown> = {}): T {
  const code = ts.transpileModule(readFileSync(new URL(name, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  const dependencies: Record<string, unknown> = {
    "@/lib/format-money": formatting,
    ...extra,
  };
  runInNewContext(code, { exports, URLSearchParams, require(name: string) {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
    if (name.startsWith("@/components/ui/")) return new Proxy({}, { get: (_, property) => String(property) });
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
    return dependencies[name];
  } });
  return exports as T;
}
const moneyFields = ["budgetTotalCost", "budgetTotalSale", "certifiedIssued", "certifiedApproved", "committedCost", "receivedCost", "accruedCost", "paidCost", "inventoryConsumedCost", "operationalProgressQty", "openCommittedCost", "expectedCostExposure", "remainingBudgetCost", "costVariance", "projectedMargin"];
const totals = Object.fromEntries(moneyFields.map((name) => [name, "100.00"])) as CostControlTotals;
function row(id: string, unit: string, quantity = "2"): CostControlRow {
  return {
    ...totals, wbsNodeId: id, wbsCode: id, wbsName: `Partida ${id}`, unit, budgetQty: quantity,
    budgetUnitCost: "50.00", budgetUnitSale: "60.00", qtyCommitted: quantity, qtyReceived: quantity, qtyConsumed: quantity, submittedProgressQty: "0",
    operationalProgressQty: quantity, pctPurchased: null, pctReceived: null, pctPhysicalProgress: null, pctEconomic: null, pctExposure: null,
    flags: { overBudget: false, overCertified: false, missingBudget: false }, byCostType: [],
  };
}

test("cost summary cards label all monetary dimensions with their actual currency", () => {
  const { CostControlSummaryCards } = module<{ CostControlSummaryCards: (props: unknown) => Element }>("../components/cost-control-summary-cards.tsx");
  const cards = nodes(CostControlSummaryCards({ totals, currency: "USD" }), "KpiStatCard");
  assert.equal(cards.length, 5);
  assert.ok(cards.every((card) => card.props.value === formatting.formatMoneyAmount("100.00", "USD")));
});

test("unvalued inventory has a gap label while independent cost layers remain formatted", () => {
  const { CostControlSummaryCards } = module<{ CostControlSummaryCards: (props: unknown) => Element }>("../components/cost-control-summary-cards.tsx");
  const cards = nodes(CostControlSummaryCards({ totals: { ...totals, inventoryConsumedCost: null }, currency: "USD" }), "KpiStatCard");
  const inventory = cards.find((card) => card.props.label === "Consumo inventario")!;
  assert.equal(inventory.props.value, "—");
  assert.match(String(inventory.props.subtitle), /Sin valuación/);
  assert.equal(cards.find((card) => card.props.label === "Exposición esperada")!.props.value, formatting.formatMoneyAmount("100.00", "USD"));
});

function table(columns: string[]) {
  const state: unknown[] = []; let index = 0;
  const { CostControlTable } = module<{ CostControlTable: (props: unknown) => Element }>("../components/cost-control-table.tsx", {
    react: { useState(initial: unknown) { const key = index++; if (!(key in state)) state[key] = typeof initial === "function" ? initial() : initial; return [state[key], (next: unknown) => { state[key] = typeof next === "function" ? next(state[key]) : next; }]; }, useEffect() {} },
    "next/link": { default: "Link" },
    "next/navigation": { usePathname: () => "/costos", useRouter: () => ({ replace() {} }), useSearchParams: () => new URLSearchParams() },
    "lucide-react": {},
    "@bloqer/services/cost-type-slice": { parseCostCategoryFilter: () => null },
    "@/lib/cost-category-colors": { COST_CATEGORY_OPTIONS: [] },
    "@bloqer/utils": { addDecimal, compareDecimal },
    "@/lib/utils": { cn: (...args: unknown[]) => args.filter(Boolean).join(" ") },
    "./cost-variance-badge": { CostVarianceBadge: "CostVarianceBadge" },
    "./wbs-item-drilldown-dialog": { WbsItemDrilldownDialog: "detail" },
    "../lib/edt-column-presets": { defaultEdtPresetState: () => ({ preset: "quantities" }), columnsForPreset: () => columns, EDT_COLUMN_LABELS: {}, EDT_PRESET_LABELS: {}, ALL_EDT_COLUMNS: [] },
  });
  return (rows: CostControlRow[], currentTotals: CostControlTotals = totals) => { index = 0; return CostControlTable({ rows, totals: currentTotals, currency: "USD", projectId: "project" }); };
}

test("quantity cells preserve unit and represent incompatible document units as unavailable", () => {
  const render = table(["qtyBudgeted", "qtyCommitted", "qtyReceived", "qtyConsumed", "physicalProgress"]);
  const item = row("A", "m2"); item.qtyCommitted = null;
  const tree = render([item]);
  assert.ok(nodes(tree, "span").some((node) => node.props.title === "Unidades no comparables con la partida; consultá el detalle o el tablero del recurso"));
  assert.match(text(tree), /2,00 m2/);
  const footer = nodes(tree, "TableFooter")[0]!;
  assert.equal(text(nodes(footer, "TableCell")[2]!.props.children), "—");
});

test("footers sum only comparable quantities with the same unit", () => {
  const render = table(["qtyBudgeted", "physicalProgress"]);
  const same = nodes(render([row("A", "m2"), row("B", "m2", "3")]), "TableFooter")[0]!;
  assert.deepEqual(nodes(same, "TableCell").slice(1).map((cell) => text(cell.props.children)), ["5,00 m2", "5,00 m2"]);
  const mixed = nodes(render([row("A", "m2"), row("B", "kg", "3")]), "TableFooter")[0]!;
  assert.deepEqual(nodes(mixed, "TableCell").slice(1).map((cell) => text(cell.props.children)), ["—", "—"]);
});

test("cost rows and totals retain the actual monetary currency", () => {
  const render = table(["budgetCost"]);
  const tree = render([row("A", "m2")]);
  const footer = nodes(tree, "TableFooter")[0]!;
  assert.equal(text(nodes(footer, "TableCell")[1]!.props.children), formatting.formatMoneyAmount("100.00", "USD"));
});

test("cost table keeps unknown consumed cost visible in row and footer without a false zero", () => {
  const item = row("A", "un"); item.inventoryConsumedCost = null;
  const tree = table(["consumed"])([item], { ...totals, inventoryConsumedCost: null });
  const gaps = nodes(tree, "span").filter((node) => node.props.title === "Sin valuación trazable");
  assert.ok(gaps.length >= 2);
  assert.ok(gaps.every((node) => text(node).includes("—")));
  assert.doesNotMatch(text(nodes(tree, "TableFooter")[0]!), /0,00/);
});

test("material variance displays unknown consumption and variance as unavailable, preserving known budget and zero", () => {
  const { MaterialWbsTable } = module<{ MaterialWbsTable: (props: unknown) => Element }>("../../reports/material-wbs-table.tsx");
  const tree = MaterialWbsTable({ currency: "USD", rows: [{ wbsNodeId: "a", wbsCode: "1", wbsName: "Unvalued", budgetMaterial: "100", consumedCost: null, variance: null, variancePct: null }, { wbsNodeId: "b", wbsCode: "2", wbsName: "No consumption", budgetMaterial: "100", consumedCost: "0.00", variance: "100.00", variancePct: "100.00" }] });
  const cells = nodes(tree, "TableBody").flatMap((body) => nodes(body, "TableCell"));
  assert.equal(text(cells[3]), "—");
  assert.equal(text(cells[4]), "—");
  assert.equal(text(cells[8]), formatting.formatMoneyAmount("0.00", "USD"));
  assert.equal(text(cells[9]), formatting.formatMoneyAmount("100.00", "USD"));
});

test("keyboard activation of a nested row control does not open its parent detail", () => {
  const render = table(["budgetCost"]); const items = [row("A", "m2")];
  const tree = render(items);
  const card = nodes(tree, "div").find((node) => node.props.role === "button")!;
  let prevented = false;
  const target = {}; const container = {};
  (card.props.onKeyDown as (event: unknown) => void)({ key: "Enter", target, currentTarget: container, preventDefault() { prevented = true; } });
  assert.equal(prevented, false);
  assert.equal(nodes(render(items), "detail")[0]!.props.wbsNodeId, null);
  (card.props.onKeyDown as (event: unknown) => void)({ key: "Enter", target: container, currentTarget: container, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(nodes(render(items), "detail")[0]!.props.wbsNodeId, "A");
});

test("functional read failures remain actionable and unexpected details stay out of the UI", () => {
  class ServiceError extends Error {
    constructor(readonly code: string, message: string) { super(message); }
  }
  const { planningReadError } = module<{ planningReadError: (error: unknown, href: string) => Element }>("./planning-read-error.tsx", {
    "next/link": { default: "Link" },
    "next/navigation": { notFound() { throw new Error("not-found"); }, redirect() { throw new Error("redirect"); } },
    "zod": { ZodError }, "@bloqer/services": { ServiceError },
  });
  const tree = planningReadError(new ServiceError("CONFLICT", "Las monedas no son comparables."), "/costos");
  assert.match(text(tree), /Las monedas no son comparables/);
  assert.equal(nodes(tree, "Link")[0]!.props.href, "/costos");
  assert.throws(() => planningReadError(new Error("private connection details"), "/costos"), /private connection details/);
  assert.throws(() => planningReadError(new ServiceError("NOT_FOUND", "private id"), "/costos"), /not-found/);
});

test("period-filtered item details label the selected period and omit global remaining balances", () => {
  const { WbsItemDrilldown } = module<{ WbsItemDrilldown: (props: unknown) => Element }>("../components/wbs-item-drilldown.tsx", {
    "next/link": { default: "Link" },
    "@/lib/format": { formatDate: String },
    "@/lib/budget-units": { budgetUnitLabel: (unit: string) => unit },
  });
  const detail: WbsItemCostDetail = {
    wbsNodeId: "item", wbsCode: "1.1", wbsName: "Montaje", currency: "USD",
    periodFiltered: true,
    warnings: [],
    budgetItem: { unit: "m2", quantity: "100", unitCostDirect: "10", totalCostDirect: "1000", unitSalePrice: "12", totalSalePrice: "1200" },
    certificationLines: [], purchaseOrderLines: [], subcontractLines: [], subcontractCertLines: [],
    supplierInvoices: [], payments: [], stockMovements: [], jobsiteProgress: [],
    materialCommitments: [], laborCommitments: [], equipmentCommitments: [], byCostType: [],
    progressSummary: {
      physicalPctAcum: "12.5", physicalQtyAcum: "3", physicalRemainingPct: "87.5",
      certifiedQty: "4", certifiedAmount: "150", economicPctOfSale: "15", remainingCertQty: "96",
      committedPctOfCost: "20", accruedPctOfCost: "10", expectedExposurePctOfCost: "22",
    },
  };
  const filtered = text(WbsItemDrilldown({ detail, projectId: "project" }));
  for (const label of ["Físico del período (libro)", "Económico del período (certificación)", "Costo del período (capas)", "% período", "Qty período"]) {
    assert.ok(filtered.includes(label), `Missing period label: ${label}`);
  }
  assert.doesNotMatch(filtered, /Restante|Saldo qty|% acum\.|Qty acum\./);
  assert.ok(filtered.includes(formatting.formatMoneyAmount("150", "USD")));
  assert.ok(filtered.includes(`${formatting.formatQtyFromString("3")} m2`));

  for (const periodFiltered of [false, undefined]) {
    const unfiltered = text(WbsItemDrilldown({ detail: { ...detail, periodFiltered }, projectId: "project" }));
    for (const label of ["Físico (libro)", "Económico (certificación)", "Costo (capas)", "% acum.", "Qty acum.", "Restante", "Saldo qty"]) {
      assert.ok(unfiltered.includes(label), `Missing all-time label: ${label}`);
    }
    assert.doesNotMatch(unfiltered, /del período|% período|Qty período/);
  }
});
