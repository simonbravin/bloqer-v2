import { buildCsv } from "../report-exports/csv-export.service";
import { safeReportFilename } from "../report-exports/filename.service";
import type { ReportCsvPayload, ReportXlsxPayload } from "../report-exports/report-export.types";
import { buildXlsxSheet } from "../report-exports/xlsx-export.service";
import { getBudgetById } from "./budget.service";
import { getWbsTree, type WbsViewNode } from "./wbs.service";
import {
  computeTreeGrandTotals,
  computeWbsRowMetrics,
  VISIBLE_WBS_COST_CATEGORIES,
} from "./wbs-metrics";
import { ServiceContext, ServiceError } from "../types";

export type BudgetWbsExportView = "breakdown" | "totals";

export type BudgetWbsExportFilters = {
  view: BudgetWbsExportView;
};

const BREAKDOWN_HEADERS = [
  "CodigoWBS",
  "Item",
  "Unidad",
  "Cantidad",
  "Materiales",
  "ManoDeObra",
  "Equipos",
  "Subcontrato",
  "TotalVenta",
] as const;

const TOTALS_HEADERS = [
  "CodigoWBS",
  "Item",
  "Unidad",
  "Cantidad",
  "CostoDirecto",
  "TotalVenta",
] as const;

const VIEW_LABEL_ES: Record<BudgetWbsExportView, string> = {
  breakdown: "Desglose",
  totals: "Totales",
};

export function parseBudgetWbsExportFilters(
  sp: Record<string, string | undefined>,
): BudgetWbsExportFilters {
  const raw = sp.view?.toLowerCase();
  if (raw === "totals") return { view: "totals" };
  return { view: "breakdown" };
}

function formatDecimal(value: number): string {
  if (!Number.isFinite(value)) return "0.00";
  return value.toFixed(2);
}

function formatQuantity(qty: number | null): string {
  if (qty == null) return "";
  if (!Number.isFinite(qty)) return "";
  return String(qty);
}

function flattenWbsTree(nodes: WbsViewNode[]): WbsViewNode[] {
  const result: WbsViewNode[] = [];
  function walk(ns: WbsViewNode[]) {
    for (const n of ns) {
      result.push(n);
      if (n.children.length) walk(n.children);
    }
  }
  walk(nodes);
  return result;
}

function breakdownRow(node: WbsViewNode, metrics: ReturnType<typeof computeWbsRowMetrics>): string[] {
  return [
    node.code,
    node.name,
    metrics.unit,
    formatQuantity(metrics.quantity),
    formatDecimal(metrics.byCategory.MATERIAL),
    formatDecimal(metrics.byCategory.LABOR),
    formatDecimal(metrics.byCategory.EQUIPMENT),
    formatDecimal(metrics.byCategory.SUBCONTRACT),
    formatDecimal(metrics.totalSalePrice),
  ];
}

function totalsRow(node: WbsViewNode, metrics: ReturnType<typeof computeWbsRowMetrics>): string[] {
  return [
    node.code,
    node.name,
    metrics.unit,
    formatQuantity(metrics.quantity),
    formatDecimal(metrics.totalCostDirect),
    formatDecimal(metrics.totalSalePrice),
  ];
}

function grandTotalRow(
  view: BudgetWbsExportView,
  grand: ReturnType<typeof computeTreeGrandTotals>,
): string[] {
  if (view === "breakdown") {
    return [
      "",
      "TOTAL GENERAL",
      "",
      "",
      formatDecimal(grand.byCategory.MATERIAL),
      formatDecimal(grand.byCategory.LABOR),
      formatDecimal(grand.byCategory.EQUIPMENT),
      formatDecimal(grand.byCategory.SUBCONTRACT),
      formatDecimal(grand.totalSalePrice),
    ];
  }
  return [
    "",
    "TOTAL GENERAL",
    "",
    "",
    formatDecimal(grand.totalCostDirect),
    formatDecimal(grand.totalSalePrice),
  ];
}

export type BudgetWbsExportPayload = {
  headers: string[];
  rows: string[][];
  meta: {
    budgetId: string;
    budgetName: string;
    versionNumber: number;
    currency: string;
    projectId: string;
    view: BudgetWbsExportView;
    viewLabel: string;
    totalCostDirect: string;
    totalSalePrice: string;
  };
};

export function buildBudgetWbsExportTable(
  tree: WbsViewNode[],
  view: BudgetWbsExportView,
): { headers: string[]; rows: string[][]; grand: ReturnType<typeof computeTreeGrandTotals> } {
  const headers = view === "breakdown" ? [...BREAKDOWN_HEADERS] : [...TOTALS_HEADERS];
  const flat = flattenWbsTree(tree);
  const rows: string[][] = [];
  for (const node of flat) {
    const metrics = computeWbsRowMetrics(node);
    rows.push(view === "breakdown" ? breakdownRow(node, metrics) : totalsRow(node, metrics));
  }
  const grand = computeTreeGrandTotals(tree);
  rows.push(grandTotalRow(view, grand));
  return { headers, rows, grand };
}

async function loadBudgetWbsExportPayload(
  budgetId: string,
  projectId: string,
  filters: BudgetWbsExportFilters,
  ctx: ServiceContext,
): Promise<BudgetWbsExportPayload> {
  const [budget, tree] = await Promise.all([
    getBudgetById(budgetId, ctx),
    getWbsTree(budgetId, ctx),
  ]);
  if (budget.projectId !== projectId) {
    throw new ServiceError("NOT_FOUND", "Presupuesto no encontrado");
  }

  const { headers, rows, grand } = buildBudgetWbsExportTable(tree, filters.view);

  return {
    headers,
    rows,
    meta: {
      budgetId: budget.id,
      budgetName: budget.name,
      versionNumber: budget.versionNumber,
      currency: budget.currency,
      projectId: budget.projectId,
      view: filters.view,
      viewLabel: VIEW_LABEL_ES[filters.view],
      totalCostDirect: formatDecimal(grand.totalCostDirect),
      totalSalePrice: formatDecimal(grand.totalSalePrice),
    },
  };
}

function exportFilenameBase(meta: BudgetWbsExportPayload["meta"]): string {
  const name = meta.budgetName.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return `presupuesto_${name}_v${meta.versionNumber}_${meta.view}`;
}

function xlsxPreamble(meta: BudgetWbsExportPayload["meta"]): string[][] {
  return [
    ["Presupuesto", meta.budgetName],
    ["Version", String(meta.versionNumber)],
    ["Moneda", meta.currency],
    ["Vista", meta.viewLabel],
  ];
}

export async function buildBudgetWbsExportPayload(
  budgetId: string,
  projectId: string,
  filters: BudgetWbsExportFilters,
  ctx: ServiceContext,
): Promise<BudgetWbsExportPayload> {
  return loadBudgetWbsExportPayload(budgetId, projectId, filters, ctx);
}

export async function exportBudgetWbsCsv(
  budgetId: string,
  projectId: string,
  filters: BudgetWbsExportFilters,
  ctx: ServiceContext,
): Promise<ReportCsvPayload> {
  const payload = await loadBudgetWbsExportPayload(budgetId, projectId, filters, ctx);
  return {
    content: buildCsv(payload.headers, payload.rows),
    filename: safeReportFilename(exportFilenameBase(payload.meta), "csv"),
  };
}

export async function exportBudgetWbsXlsx(
  budgetId: string,
  projectId: string,
  filters: BudgetWbsExportFilters,
  ctx: ServiceContext,
): Promise<ReportXlsxPayload> {
  const payload = await loadBudgetWbsExportPayload(budgetId, projectId, filters, ctx);
  const buffer = buildXlsxSheet(payload.headers, payload.rows, {
    sheetName: "Presupuesto",
    preamble: xlsxPreamble(payload.meta),
  });
  return {
    buffer,
    filename: safeReportFilename(exportFilenameBase(payload.meta), "xlsx"),
  };
}

/** Column keys for PDF row mapping (breakdown vs totals). */
export function budgetWbsExportPdfColumns(view: BudgetWbsExportView): { key: string; label: string; flex?: number }[] {
  if (view === "breakdown") {
    return [
      { key: "code", label: "Nº", flex: 0.6 },
      { key: "name", label: "Ítem", flex: 1.4 },
      { key: "unit", label: "Un.", flex: 0.5 },
      { key: "qty", label: "Cant.", flex: 0.5 },
      ...VISIBLE_WBS_COST_CATEGORIES.map((cat) => ({
        key: cat.toLowerCase(),
        label:
          cat === "MATERIAL"
            ? "Mat."
            : cat === "LABOR"
              ? "M.O."
              : cat === "EQUIPMENT"
                ? "Eq."
                : "Subc.",
        flex: 0.6,
      })),
      { key: "sale", label: "Venta", flex: 0.8 },
    ];
  }
  return [
    { key: "code", label: "Nº", flex: 0.7 },
    { key: "name", label: "Ítem", flex: 1.6 },
    { key: "unit", label: "Un.", flex: 0.5 },
    { key: "qty", label: "Cant.", flex: 0.5 },
    { key: "cost", label: "Costo dir.", flex: 0.9 },
    { key: "sale", label: "Venta", flex: 0.9 },
  ];
}

const PDF_ROW_KEYS: Record<BudgetWbsExportView, readonly string[]> = {
  breakdown: ["code", "name", "unit", "qty", "material", "labor", "equipment", "subcontract", "sale"],
  totals: ["code", "name", "unit", "qty", "cost", "sale"],
};

/** Maps export table rows (incl. TOTAL GENERAL) to PDF column keys. */
export function budgetWbsExportPdfRowsFromTable(
  view: BudgetWbsExportView,
  rows: string[][],
): Record<string, string>[] {
  const keys = PDF_ROW_KEYS[view];
  return rows.map((row) => {
    const record: Record<string, string> = {};
    keys.forEach((key, index) => {
      record[key] = row[index] ?? "";
    });
    return record;
  });
}
