import { buildPurchaseOrderDocument, type ServiceContext } from "@bloqer/services";
import { resolvePdfReportBranding } from "./branding/pdf-branding.service";
import { safeReportFilename } from "./filename.service";
import type { ReportPdfPayload } from "./pdf/pdf-export.types";
import { renderReportPdfToBuffer } from "./pdf/pdf-renderer.service";
import { PurchaseOrderDocumentPdf } from "./pdf/purchase-order-document-pdf";

export async function exportPurchaseOrderPdf(
  purchaseOrderId: string,
  projectId: string,
  ctx: ServiceContext,
): Promise<ReportPdfPayload> {
  const { companyId, document } = await buildPurchaseOrderDocument(purchaseOrderId, projectId, ctx);
  const branding = await resolvePdfReportBranding({ ...ctx, companyId }, { projectId });
  const buffer = await renderReportPdfToBuffer(
    <PurchaseOrderDocumentPdf
      document={document}
      branding={{ ...branding, companyDisplayName: document.company.name, generatedByLabel: null }}
    />,
  );
  return { buffer, filename: safeReportFilename(`${document.code}_${document.company.name}`.replace(/\.+$/, ""), "pdf") };
}
