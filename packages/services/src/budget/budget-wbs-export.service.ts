import { formatWbsIncidencePercentExport, wbsIncidencePercent } from "@bloqer/domain";
import { buildCsv } from "../report-exports/csv-export.service";
import { safeReportFilename } from "../report-exports/filename.service";
import type { ReportCsvPayload, ReportXlsxPayload } from "../report-exports/report-export.types";
import { buildXlsxSheet } from "../report-exports/xlsx-export.service";
import { getBudgetById } from "./budget.service";
import { getWbsTree, type WbsViewNode } from "./wbs.service";
import {
  computeTreeGrandTotals,
  computeUnitCategoryCosts,
  computeWbsRowMetrics,
  VISIBLE_WBS_COST_CATEGORIES,
  type WbsRowMetrics,
} from "./wbs-metrics";
import { ServiceContext, ServiceError } from "../types";

/** Legacy layout alias kept for URL/back-compat. */
export type BudgetWbsExportView = "breakdown" | "totals";

/** Full EDT view axes for export ([D-058], [D-060]). */
export type BudgetWbsExportMode = {
  base: "cost" | "sale";
  scale: "unit" | "total";
  detail: "compact" | "breakdown";
  showIncidence: boolean;
};

export type BudgetWbsExportFilters = BudgetWbsExportMode & {
  /** Derived: cost+breakdown → breakdown; otherwise totals. */
  view: BudgetWbsExportView;
};

function modeToLegacyView(mode: BudgetWbsExportMode): BudgetWbsExportView {
  return mode.base === "cost" && mode.detail === "breakdown" ? "breakdown" : "totals";
}

function normalizeExportMode(partial: Partial<BudgetWbsExportMode>): BudgetWbsExportMode {
  const base = partial.base === "sale" ? "sale" : "cost";
  return {
    base,
    scale: partial.scale === "unit" ? "unit" : "total",
    detail: base === "sale" ? "compact" : partial.detail === "compact" ? "compact" : "breakdown",
    showIncidence: partial.showIncidence === true,
  };
}

function viewLabelEs(mode: BudgetWbsExportMode): string {
  const parts = [mode.base === "sale" ? "Venta" : "Costo"];
  if (mode.base === "cost") {
    parts.push(mode.detail === "breakdown" ? "Desglose" : "Compacto");
  }
  // Totals always included; Unitario is additive ([D-058] amend).
  if (mode.scale === "unit") parts.push("Unitario");
  if (mode.showIncidence) parts.push("Incidencia");
  return parts.join(" · ");
}

/**
 * Parse export query params.
 * New: base, scale, detail, incidence=1|0|true|false
 * Legacy: view=breakdown|totals
 */
export function parseBudgetWbsExportFilters(
  sp: Record<string, string | undefined>,
): BudgetWbsExportFilters {
  const hasNewAxes =
    sp.base != null || sp.scale != null || sp.detail != null || sp.incidence != null;

  let mode: BudgetWbsExportMode;
  if (hasNewAxes) {
    const incidenceRaw = (sp.incidence ?? "").toLowerCase();
    mode = normalizeExportMode({
      base: sp.base === "sale" ? "sale" : "cost",
      scale: sp.scale === "unit" ? "unit" : "total",
      detail: sp.detail === "compact" ? "compact" : "breakdown",
      showIncidence: incidenceRaw === "1" || incidenceRaw === "true",
    });
  } else {
    const raw = sp.view?.toLowerCase();
    mode = normalizeExportMode({
      base: "cost",
      scale: "total",
      detail: raw === "totals" ? "compact" : "breakdown",
      showIncidence: false,
    });
  }

  return { ...mode, view: modeToLegacyView(mode) };
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

function buildHeaders(mode: BudgetWbsExportMode): string[] {
  const headers = ["CodigoWBS", "Item", "Unidad", "Cantidad"];
  const withUnit = mode.scale === "unit";

  if (mode.base === "sale") {
    if (withUnit) headers.push("PUVenta");
    headers.push("TotalVenta");
  } else if (mode.detail === "breakdown") {
    if (withUnit) {
      headers.push(
        "Materiales_u",
        "ManoDeObra_u",
        "Equipos_u",
        "Subcontrato_u",
        "CostoDirecto_u",
      );
    }
    headers.push("Materiales", "ManoDeObra", "Equipos", "Subcontrato", "CostoDirecto");
  } else {
    if (withUnit) headers.push("CostoDirecto_u");
    headers.push("CostoDirecto");
  }
  if (mode.showIncidence) headers.push("IncidenciaPct");
  return headers;
}

function moneyCellsForNode(
  node: WbsViewNode,
  metrics: WbsRowMetrics,
  mode: BudgetWbsExportMode,
): string[] {
  const isLeaf = node.children.length === 0 && !!node.costItem;
  const unitCats = isLeaf ? computeUnitCategoryCosts(node) : null;
  const unitCd = isLeaf ? parseFloat(node.costItem!.unitCostDirect) || 0 : null;
  const unitSale = isLeaf ? parseFloat(node.costItem!.unitSalePrice) || 0 : null;
  const withUnit = mode.scale === "unit";
  const cells: string[] = [];

  if (mode.base === "sale") {
    if (withUnit) cells.push(unitSale != null ? formatDecimal(unitSale) : "");
    cells.push(formatDecimal(metrics.totalSalePrice));
    return cells;
  }

  if (mode.detail === "breakdown") {
    if (withUnit) {
      if (!unitCats || unitCd == null) {
        cells.push("", "", "", "", "");
      } else {
        cells.push(
          formatDecimal(unitCats.MATERIAL),
          formatDecimal(unitCats.LABOR),
          formatDecimal(unitCats.EQUIPMENT),
          formatDecimal(unitCats.SUBCONTRACT),
          formatDecimal(unitCd),
        );
      }
    }
    cells.push(
      formatDecimal(metrics.byCategory.MATERIAL),
      formatDecimal(metrics.byCategory.LABOR),
      formatDecimal(metrics.byCategory.EQUIPMENT),
      formatDecimal(metrics.byCategory.SUBCONTRACT),
      formatDecimal(metrics.totalCostDirect),
    );
    return cells;
  }

  if (withUnit) cells.push(unitCd != null ? formatDecimal(unitCd) : "");
  cells.push(formatDecimal(metrics.totalCostDirect));
  return cells;
}

function moneyCellsForGrand(
  grand: ReturnType<typeof computeTreeGrandTotals>,
  mode: BudgetWbsExportMode,
): string[] {
  const withUnit = mode.scale === "unit";
  const cells: string[] = [];

  if (mode.base === "sale") {
    if (withUnit) cells.push("");
    cells.push(formatDecimal(grand.totalSalePrice));
    return cells;
  }
  if (mode.detail === "breakdown") {
    if (withUnit) cells.push("", "", "", "", "");
    cells.push(
      formatDecimal(grand.byCategory.MATERIAL),
      formatDecimal(grand.byCategory.LABOR),
      formatDecimal(grand.byCategory.EQUIPMENT),
      formatDecimal(grand.byCategory.SUBCONTRACT),
      formatDecimal(grand.totalCostDirect),
    );
    return cells;
  }
  if (withUnit) cells.push("");
  cells.push(formatDecimal(grand.totalCostDirect));
  return cells;
}

function incidenceForMetrics(
  metrics: Pick<WbsRowMetrics, "totalCostDirect" | "totalSalePrice">,
  grand: ReturnType<typeof computeTreeGrandTotals>,
  mode: BudgetWbsExportMode,
): string {
  if (!mode.showIncidence) return "";
  const part = mode.base === "sale" ? metrics.totalSalePrice : metrics.totalCostDirect;
  const whole = mode.base === "sale" ? grand.totalSalePrice : grand.totalCostDirect;
  return formatWbsIncidencePercentExport(wbsIncidencePercent(part, whole));
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
    mode: BudgetWbsExportMode;
    totalCostDirect: string;
    totalSalePrice: string;
  };
};

export function buildBudgetWbsExportTable(
  tree: WbsViewNode[],
  modeOrView: BudgetWbsExportMode | BudgetWbsExportView,
): { headers: string[]; rows: string[][]; grand: ReturnType<typeof computeTreeGrandTotals> } {
  const mode: BudgetWbsExportMode =
    typeof modeOrView === "string"
      ? normalizeExportMode({
          base: "cost",
          scale: "total",
          detail: modeOrView === "totals" ? "compact" : "breakdown",
          showIncidence: false,
        })
      : normalizeExportMode(modeOrView);

  const headers = buildHeaders(mode);
  const flat = flattenWbsTree(tree);
  const grand = computeTreeGrandTotals(tree);
  const rows: string[][] = [];

  for (const node of flat) {
    const metrics = computeWbsRowMetrics(node);
    const row = [
      node.code,
      node.name,
      metrics.unit,
      formatQuantity(metrics.quantity),
      ...moneyCellsForNode(node, metrics, mode),
    ];
    if (mode.showIncidence) {
      row.push(incidenceForMetrics(metrics, grand, mode));
    }
    rows.push(row);
  }

  const totalRow = [
    "",
    "TOTAL GENERAL",
    "",
    "",
    ...moneyCellsForGrand(grand, mode),
  ];
  if (mode.showIncidence) {
    totalRow.push(incidenceForMetrics(grand, grand, mode));
  }
  rows.push(totalRow);

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

  const mode = normalizeExportMode(filters);
  const { headers, rows, grand } = buildBudgetWbsExportTable(tree, mode);
  const view = modeToLegacyView(mode);

  return {
    headers,
    rows,
    meta: {
      budgetId: budget.id,
      budgetName: budget.name,
      versionNumber: budget.versionNumber,
      currency: budget.currency,
      projectId: budget.projectId,
      view,
      viewLabel: viewLabelEs(mode),
      mode,
      totalCostDirect: formatDecimal(grand.totalCostDirect),
      totalSalePrice: formatDecimal(grand.totalSalePrice),
    },
  };
}

function exportFilenameBase(meta: BudgetWbsExportPayload["meta"]): string {
  const name = meta.budgetName.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const m = meta.mode;
  const slug = [
    m.base,
    m.scale,
    m.base === "cost" ? m.detail : "compact",
    m.showIncidence ? "inc" : null,
  ]
    .filter(Boolean)
    .join("_");
  return `presupuesto_${name}_v${meta.versionNumber}_${slug}`;
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

/** Column keys/labels for PDF from export headers. */
export function budgetWbsExportPdfColumns(
  filters: BudgetWbsExportFilters | BudgetWbsExportView,
): { key: string; label: string; flex?: number }[] {
  const mode =
    typeof filters === "string"
      ? parseBudgetWbsExportFilters({ view: filters })
      : normalizeExportMode(filters);
  const headers = buildHeaders(mode);
  return headers.map((label, index) => ({
    key: `c${index}`,
    label: pdfHeaderLabelEs(label),
    flex: index <= 1 ? (index === 1 ? 1.4 : 0.6) : 0.7,
  }));
}

function pdfHeaderLabelEs(label: string): string {
  switch (label) {
    case "CodigoWBS":
      return "Nº";
    case "Item":
      return "Ítem";
    case "Unidad":
      return "Un.";
    case "Cantidad":
      return "Cant.";
    case "IncidenciaPct":
      return "Incid.";
    case "PUVenta":
      return "PU venta";
    case "TotalVenta":
      return "Total venta";
    case "CostoDirecto":
      return "Costo dir.";
    case "CostoDirecto_u":
      return "Costo dir./u";
    case "Materiales_u":
      return "Mat./u";
    case "ManoDeObra_u":
      return "MO/u";
    case "Equipos_u":
      return "Eq./u";
    case "Subcontrato_u":
      return "Sub./u";
    case "Materiales":
      return "Mat.";
    case "ManoDeObra":
      return "MO";
    case "Equipos":
      return "Eq.";
    case "Subcontrato":
      return "Sub.";
    default:
      return label.replace(/_/g, " ");
  }
}

/** Maps export table rows (incl. TOTAL GENERAL) to PDF column keys. */
export function budgetWbsExportPdfRowsFromTable(
  filters: BudgetWbsExportFilters | BudgetWbsExportView,
  rows: string[][],
): Record<string, string>[] {
  const mode =
    typeof filters === "string"
      ? parseBudgetWbsExportFilters({ view: filters })
      : normalizeExportMode(filters);
  const colCount = buildHeaders(mode).length;
  return rows.map((row) => {
    const record: Record<string, string> = {};
    for (let i = 0; i < colCount; i++) {
      record[`c${i}`] = row[i] ?? "";
    }
    // Convenience aliases used by older tests / consumers
    record.code = row[0] ?? "";
    record.name = row[1] ?? "";
    return record;
  });
}

// Re-export category list for callers that imported from here historically
export { VISIBLE_WBS_COST_CATEGORIES };
