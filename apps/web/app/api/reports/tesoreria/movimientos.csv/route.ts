import { NextRequest, NextResponse } from "next/server";
import {
  exportTreasuryMovementsCsv,
  exportTreasuryMovementsPdf,
  getAccountMovementReport,
  parseMovementReportFilters,
} from "@bloqer/services";
import {
  csvResponse,
  pdfResponse,
  reportExportErrorResponse,
  requireReportExportContext,
  searchParamsRecord,
} from "@/lib/report-export-http";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireReportExportContext();
  if (!auth.ok) return auth.response;
  const sp = searchParamsRecord(req);
  try {
    const filters = parseMovementReportFilters(sp);
    const fmt = (sp.format ?? "csv").toLowerCase();
    if (fmt === "json") {
      const data = await getAccountMovementReport(filters, auth.ctx);
      return NextResponse.json(data);
    }
    if (fmt === "pdf") {
      const { buffer, filename } = await exportTreasuryMovementsPdf(filters, auth.ctx);
      return pdfResponse(buffer, filename);
    }
    if (fmt === "csv") {
      const { content, filename } = await exportTreasuryMovementsCsv(filters, auth.ctx);
      return csvResponse(content, filename);
    }
    return NextResponse.json({ error: "Formato no soportado" }, { status: 400 });
  } catch (e) {
    return reportExportErrorResponse(e);
  }
}
