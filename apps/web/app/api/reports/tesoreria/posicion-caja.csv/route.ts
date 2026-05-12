import { NextRequest, NextResponse } from "next/server";
import {
  assertPdfExportNotRequested,
  exportCashPositionCsv,
  getCashPositionReport,
  parseCashPositionFilters,
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
    const filters = parseCashPositionFilters(sp);
    if (sp.format === "json") {
      const data = await getCashPositionReport(filters, auth.ctx);
      return NextResponse.json(data);
    }
    const { content, filename } = await exportCashPositionCsv(filters, auth.ctx);
    return csvResponse(content, filename);
  } catch (e) {
    return reportExportErrorResponse(e);
  }
}
