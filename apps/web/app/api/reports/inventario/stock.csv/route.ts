import { NextRequest, NextResponse } from "next/server";
import {
  exportStockBalanceCsv,
  exportStockBalancePdf,
  getStockBalanceReport,
  parseStockBalanceFilters,
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
    const filters = parseStockBalanceFilters(sp);
    const fmt = (sp.format ?? "csv").toLowerCase();
    if (fmt === "json") {
      const data = await getStockBalanceReport(filters, auth.ctx);
      return NextResponse.json(data);
    }
    if (fmt === "pdf") {
      const { buffer, filename } = await exportStockBalancePdf(filters, auth.ctx);
      return pdfResponse(buffer, filename);
    }
    if (fmt === "csv") {
      const { content, filename } = await exportStockBalanceCsv(filters, auth.ctx);
      return csvResponse(content, filename);
    }
    return NextResponse.json({ error: "Formato no soportado" }, { status: 400 });
  } catch (e) {
    return reportExportErrorResponse(e);
  }
}
