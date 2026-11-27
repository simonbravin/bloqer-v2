import { getMyFieldPendingItems } from "./field-pending.service";
import { parseFieldPendingGroup, resolveFieldPendingProjectFilter } from "./field-pending-access";
import { filterPendingView } from "./field-pending-labels";
import { PENDING_EXPORT_COLUMNS, pendingExportRows } from "./field-pending-export-pure";
import { buildCsv } from "../report-exports/csv-export.service";
import { buildXlsxWorkbook } from "../report-exports/xlsx-export.service";
import { safeReportFilename } from "../report-exports/filename.service";
import { ServiceError, type ServiceContext } from "../types";

export type PendingExportParams = Record<string, string | undefined>;

export async function buildFieldPendingExport(sp: PendingExportParams, ctx: ServiceContext) {
  const projectId = resolveFieldPendingProjectFilter(sp.proyecto);
  const group = parseFieldPendingGroup(sp.grupo);
  // A malformed filter must not silently widen an export.
  if (sp.grupo && !group) throw new ServiceError("VALIDATION", "Grupo de pendientes inválido");
  if (sp.overdue && sp.overdue !== "1") throw new ServiceError("VALIDATION", "Filtro de vencidos inválido");
  if (sp.sort && !["operational", "oldest", "newest"].includes(sp.sort)) {
    throw new ServiceError("VALIDATION", "Orden de pendientes inválido");
  }
  const list = await getMyFieldPendingItems(ctx, { projectId, group, complete: true });
  const items = filterPendingView(list.items, sp);
  const filterLine = [group ?? "Todos los tipos", projectId ? "Obra seleccionada" : "Todas las obras autorizadas",
    sp.search?.trim() ? `Búsqueda: ${sp.search.trim()}` : "", sp.overdue === "1" ? "Solo vencidos" : "",
    sp.sort === "oldest" ? "Más antiguos" : sp.sort === "newest" ? "Más recientes" : "Orden operativo",
  ].filter(Boolean).join(" · ");
  return { projectId, filterLine, items, rows: pendingExportRows(items), generatedAt: new Date().toISOString() };
}

export async function exportFieldPendingData(format: "csv" | "xlsx", sp: PendingExportParams, ctx: ServiceContext) {
  const table = await buildFieldPendingExport(sp, ctx);
  const headers = PENDING_EXPORT_COLUMNS.map(([, label]) => label);
  const rows = table.rows.map((row) => PENDING_EXPORT_COLUMNS.map(([key]) => row[key] ?? ""));
  const filename = safeReportFilename("pendientes", format);
  if (format === "csv") return { filename, content: buildCsv(headers, rows) };
  return { filename, buffer: buildXlsxWorkbook([{
    sheetName: "Pendientes", headers, rows,
    colWidths: [20, 22, 32, 24, 20, 36, 34, 26, 26, 28, 22, 12, 22, 65],
    preamble: [["Pendientes"], [table.filterLine], [`Generado (UTC): ${table.generatedAt}`],
      [`Organización: ${ctx.tenantId}`, `Empresa: ${ctx.companyId ?? "Todas las autorizadas"}`, `Usuario: ${ctx.actorUserId}`],
      [`${rows.length} acciones. Montos del documento, no saldos a pagar. No sumar monedas ni acciones de una misma OC.`]],
  }]) };
}
