import { getProjectProgressReport } from "../reports/project-progress.service";
import type { ProjectProgressFilters } from "../reports/project-progress.types";
import { MAX_EXPORT_ROWS } from "../finance/pagination";
import { ServiceContext, ServiceError } from "../types";
import { buildCsv } from "./csv-export.service";
import { safeReportFilename } from "./filename.service";
import { buildProjectProgressExportSheets } from "./project-progress-export-pure";
import type { ReportCsvPayload, ReportXlsxPayload } from "./report-export.types";
import { buildXlsxWorkbook } from "./xlsx-export.service";

async function progressTables(
  projectId: string,
  filters: ProjectProgressFilters,
  ctx: ServiceContext,
) {
  const report = await getProjectProgressReport(projectId, filters, ctx);
  if (report.type !== "REPORT")
    throw new ServiceError(
      "CONFLICT",
      "No hay presupuesto aprobado o cerrado para exportar avances",
    );
  const sheets = buildProjectProgressExportSheets(report);
  if (sheets.reduce((n, s) => n + s.rows.length, 0) > MAX_EXPORT_ROWS) {
    throw new ServiceError(
      "VALIDATION",
      "El reporte supera el límite de exportación; acotá el alcance o el período",
    );
  }
  return { sheets, filename: `avance_proyecto_${report.dateTo}` };
}

export async function exportProjectProgressCsv(
  projectId: string,
  filters: ProjectProgressFilters,
  ctx: ServiceContext,
): Promise<ReportCsvPayload> {
  const { sheets, filename } = await progressTables(projectId, filters, ctx);
  const width = Math.max(...sheets.map((s) => s.headers.length));
  const pad = (cells: string[]) => [
    ...cells,
    ...Array<string>(Math.max(0, width - cells.length)).fill(""),
  ];
  const rows: string[][] = [];
  for (const sheet of sheets) {
    rows.push([sheet.sheetName, ...pad(sheet.headers)]);
    for (const row of sheet.preamble ?? []) rows.push(["Criterio", ...pad(row)]);
    for (const row of sheet.rows) rows.push([sheet.sheetName, ...pad(row)]);
  }
  return {
    content: buildCsv(
      ["Sección", ...Array.from({ length: width }, (_, i) => `Dato ${i + 1}`)],
      rows,
    ),
    filename: safeReportFilename(filename, "csv"),
  };
}

export async function exportProjectProgressXlsx(
  projectId: string,
  filters: ProjectProgressFilters,
  ctx: ServiceContext,
): Promise<ReportXlsxPayload> {
  const { sheets, filename } = await progressTables(projectId, filters, ctx);
  return { buffer: buildXlsxWorkbook(sheets), filename: safeReportFilename(filename, "xlsx") };
}
