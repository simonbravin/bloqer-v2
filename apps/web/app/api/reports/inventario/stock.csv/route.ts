import { NextRequest, NextResponse } from "next/server";
import {
  assertPdfExportNotRequested,
  exportStockBalanceCsv,
  getStockBalanceReport,
  parseStockBalanceFilters,
} from "@bloqer/services";
import {
  csvResponse,
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
    assertPdfExportNotRequested(sp.format);
    const filters = parseStockBalanceFilters(sp);
    if (sp.format === "json") {
      const data = await getStockBalanceReport(filters, auth.ctx);
      return NextResponse.json(data);
    }
    const { content, filename } = await exportStockBalanceCsv(filters, auth.ctx);
    return csvResponse(content, filename);
  } catch (e) {
    return reportExportErrorResponse(e);
  }
}
