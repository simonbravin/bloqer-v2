import { buildFieldPendingExport, type PendingExportParams, type ServiceContext } from "@bloqer/services";
import { resolvePdfReportBranding } from "./branding/pdf-branding.service";
import { FieldPendingPdfDocument } from "./pdf/field-pending-pdf";
import { renderReportPdfToBuffer } from "./pdf/pdf-renderer.service";
import { safeReportFilename } from "./filename.service";

export async function exportFieldPendingPdf(sp: PendingExportParams, ctx: ServiceContext) {
  const table = await buildFieldPendingExport(sp, ctx);
  const branding = await resolvePdfReportBranding(ctx, { projectId: table.projectId });
  return {
    buffer: await renderReportPdfToBuffer(<FieldPendingPdfDocument branding={branding} filterLine={table.filterLine} rows={table.rows} />),
    filename: safeReportFilename("pendientes", "pdf"),
  };
}
