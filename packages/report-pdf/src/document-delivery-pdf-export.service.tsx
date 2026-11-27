import { buildProjectDocumentDeliveryExport, type DocumentDeliveryParams, type ServiceContext } from "@bloqer/services";
import { resolvePdfReportBranding } from "./branding/pdf-branding.service";
import { DocumentDeliveryPdfDocument } from "./pdf/document-delivery-pdf";
import { renderReportPdfToBuffer } from "./pdf/pdf-renderer.service";

export async function exportProjectDocumentDeliveryPdf(projectId: string, params: DocumentDeliveryParams, ctx: ServiceContext) {
  const data = await buildProjectDocumentDeliveryExport(projectId, params, ctx);
  const branding = await resolvePdfReportBranding(ctx, { projectId });
  return {
    buffer: await renderReportPdfToBuffer(<DocumentDeliveryPdfDocument branding={branding} filterLine={data.filterLine} rows={data.rows} />),
    filename: `indice-entrega-${projectId}.pdf`,
  };
}
