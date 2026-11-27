import { NextRequest, NextResponse } from "next/server";
import { exportFieldPendingData } from "@bloqer/services";
import { exportFieldPendingPdf } from "@bloqer/report-pdf";
import { csvResponse, pdfResponse, xlsxResponse, reportExportErrorResponse, requireReportExportContext, searchParamsRecord } from "@/lib/report-export-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireReportExportContext();
  if (!auth.ok) return auth.response;
  const params = searchParamsRecord(request);
  const format = params.format ?? "csv";
  if (!["csv", "xlsx", "pdf"].includes(format)) {
    return NextResponse.json({ error: "Formato inválido" }, { status: 400 });
  }
  try {
    if (format === "pdf") {
      const result = await exportFieldPendingPdf(params, auth.ctx);
      return pdfResponse(result.buffer, result.filename);
    }
    const result = await exportFieldPendingData(format as "csv" | "xlsx", params, auth.ctx);
    return result.buffer ? xlsxResponse(result.buffer, result.filename) : csvResponse(result.content!, result.filename);
  } catch (error) {
    return reportExportErrorResponse(error);
  }
}
