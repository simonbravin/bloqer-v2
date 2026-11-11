import {
  buildProjectOperationalListExport,
  type ProjectOperationalListKind,
  type OperationalListExportParams,
  type ServiceContext,
} from "@bloqer/services";
import { resolvePdfReportBranding } from "./branding/pdf-branding.service";
import { ProjectSimpleTablePdfDocument } from "./pdf/project-simple-table-pdf";
import { MAX_PROJECT_REPORT_PDF_ROWS, type ReportPdfPayload } from "./pdf/pdf-export.types";
import { renderReportPdfToBuffer } from "./pdf/pdf-renderer.service";
import { safeReportFilename } from "./filename.service";

export async function exportProjectOperationalListPdf(
  projectId: string,
  kind: ProjectOperationalListKind,
  sp: OperationalListExportParams,
  ctx: ServiceContext,
): Promise<ReportPdfPayload> {
  // Authorize and read through the same service as XLSX before resolving branding.
  const table = await buildProjectOperationalListExport(projectId, kind, sp, ctx);
  const branding = await resolvePdfReportBranding(ctx, { projectId });
  const truncated = table.rows.length > MAX_PROJECT_REPORT_PDF_ROWS;
  const note = truncated
    ? `Detalle truncado: ${table.rows.length - MAX_PROJECT_REPORT_PDF_ROWS} filas omitidas (límite ${MAX_PROJECT_REPORT_PDF_ROWS}). Exportá Excel para el detalle completo.`
    : undefined;
  const buffer = await renderReportPdfToBuffer(
    <ProjectSimpleTablePdfDocument
      branding={branding}
      title={table.title}
      subtitle={`${table.rows.length} registros encontrados`}
      filterLine={table.filterLine}
      columns={table.columns}
      rows={table.rows}
      warnings={note ? [note] : undefined}
      footerNote={note}
    />,
  );
  return { buffer, filename: safeReportFilename(table.filenameBase, "pdf") };
}
