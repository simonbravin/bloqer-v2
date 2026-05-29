import { AUDIT_UI_MODULE_LABEL_ES } from "@bloqer/domain";
import { MAX_AUDIT_LOG_PDF_ROWS } from "../report-exports/pdf/pdf-export.types";
import { ProjectSimpleTablePdfDocument } from "../report-exports/pdf/project-simple-table-pdf";
import { renderReportPdfToBuffer } from "../report-exports/pdf/pdf-renderer.service";
import type { ReportPdfPayload } from "../report-exports/pdf/pdf-export.types";
import { safeReportFilename } from "../report-exports/filename.service";
import type { ServiceContext } from "../types";
import { formatAuditLogExportFilterLine } from "./audit-display";
import {
  fetchTenantAuditLogForExport,
  type ListTenantAuditLogFilters,
  type TenantAuditLogExportUrlFilters,
} from "./audit-read.service";

export async function exportTenantAuditLogPdf(
  filters: Omit<ListTenantAuditLogFilters, "cursor" | "limit">,
  ctx: ServiceContext,
  urlFilters?: TenantAuditLogExportUrlFilters,
): Promise<ReportPdfPayload> {
  const { rows, truncated } = await fetchTenantAuditLogForExport(
    filters,
    ctx,
    MAX_AUDIT_LOG_PDF_ROWS,
  );

  const generatedAtIso = new Date().toISOString();
  const pdfRows = rows.map((r) => ({
    createdAt: r.createdAt.toISOString().replace("T", " ").slice(0, 19),
    actor: r.actorLabel,
    module: r.module ? AUDIT_UI_MODULE_LABEL_ES[r.module] : "—",
    action: r.actionLabel,
    reference: r.reference ?? "—",
    project: r.projectName ?? "—",
  }));

  const filterLine = formatAuditLogExportFilterLine(urlFilters ?? {});
  const warnings: string[] = [];
  if (truncated) {
    warnings.push(
      `Detalle truncado: se muestran ${MAX_AUDIT_LOG_PDF_ROWS} filas. Exportá CSV para el detalle completo (hasta 10.000 filas con diff JSON).`,
    );
  }

  const buffer = await renderReportPdfToBuffer(
    <ProjectSimpleTablePdfDocument
      title="Registro de actividad"
      subtitle="Trazabilidad de acciones críticas del tenant"
      filterLine={filterLine}
      generatedAtIso={generatedAtIso}
      maxRows={MAX_AUDIT_LOG_PDF_ROWS}
      columns={[
        { key: "createdAt", label: "Fecha (UTC)", flex: 1.15 },
        { key: "actor", label: "Usuario", flex: 1.2 },
        { key: "module", label: "Módulo", flex: 0.9 },
        { key: "action", label: "Acción", flex: 1.35 },
        { key: "reference", label: "Ref.", flex: 0.55 },
        { key: "project", label: "Proyecto", flex: 1.1 },
      ]}
      rows={pdfRows}
      warnings={warnings}
    />,
  );

  const dateStamp = generatedAtIso.slice(0, 10);
  const base = truncated
    ? `registro_actividad_${dateStamp}_truncado_${MAX_AUDIT_LOG_PDF_ROWS}`
    : `registro_actividad_${dateStamp}`;

  return { buffer, filename: safeReportFilename(base, "pdf") };
}
