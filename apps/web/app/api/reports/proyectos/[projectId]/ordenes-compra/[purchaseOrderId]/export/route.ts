import { NextRequest, NextResponse } from "next/server";
import { exportPurchaseOrderPdf } from "@bloqer/report-pdf";
import {
  pdfResponse,
  reportExportErrorResponse,
  requireReportExportContext,
  searchParamsRecord,
} from "@/lib/report-export-http";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ projectId: string; purchaseOrderId: string }> },
) {
  const auth = await requireReportExportContext();
  if (!auth.ok) return auth.response;
  const { projectId, purchaseOrderId } = await context.params;
  if ((searchParamsRecord(req).format ?? "pdf").toLowerCase() !== "pdf") {
    return NextResponse.json({ error: "Formato no soportado. Usá format=pdf." }, { status: 400 });
  }
  try {
    const { buffer, filename } = await exportPurchaseOrderPdf(purchaseOrderId, projectId, auth.ctx);
    return pdfResponse(buffer, filename);
  } catch (error) {
    return reportExportErrorResponse(error);
  }
}
