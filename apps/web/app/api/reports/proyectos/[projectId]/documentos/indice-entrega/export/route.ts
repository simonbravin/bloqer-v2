import { NextRequest, NextResponse } from "next/server";
import { exportProjectDocumentDeliveryIndex, ServiceError } from "@bloqer/services";
import { exportProjectDocumentDeliveryPdf } from "@bloqer/report-pdf";
import { isUuid } from "@bloqer/utils";
import { csvResponse, pdfResponse, reportExportErrorResponse, requireReportExportContext, xlsxResponse } from "@/lib/report-export-http";

function privateResponse(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await requireReportExportContext();
  if (!auth.ok) return privateResponse(auth.response);
  const { projectId } = await params;
  if (!isUuid(projectId)) return privateResponse(NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 }));
  try {
    const format = req.nextUrl.searchParams.get("format") ?? "csv";
    const filters = {
      search: req.nextUrl.searchParams.get("search") ?? undefined,
      category: req.nextUrl.searchParams.get("category") ?? undefined,
      status: req.nextUrl.searchParams.get("status") ?? undefined,
    };
    if (format === "pdf") {
      const result = await exportProjectDocumentDeliveryPdf(projectId, filters, auth.ctx);
      return privateResponse(pdfResponse(result.buffer, result.filename));
    }
    if (format !== "csv" && format !== "xlsx") throw new ServiceError("VALIDATION", "Formato de exportación inválido");
    const result = await exportProjectDocumentDeliveryIndex(projectId, filters, format, auth.ctx);
    return privateResponse(result.buffer ? xlsxResponse(result.buffer, result.filename) : csvResponse(result.content!, result.filename));
  } catch (error) { return privateResponse(reportExportErrorResponse(error)); }
}
