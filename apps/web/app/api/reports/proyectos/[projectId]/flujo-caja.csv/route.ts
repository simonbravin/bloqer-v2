import { NextRequest, NextResponse } from "next/server";
import {
  assertPdfExportNotRequested,
  exportProjectCashFlowCsv,
  getProjectCashFlowReport,
  parseProjectCashFlowFilters,
} from "@bloqer/services";
import {
  csvResponse,
  reportExportErrorResponse,
  requireReportExportContext,
  searchParamsRecord,
} from "@/lib/report-export-http";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ projectId: string }> }) {
  const auth = await requireReportExportContext();
  if (!auth.ok) return auth.response;
  const { projectId } = await ctx.params;
  const sp = searchParamsRecord(req);
  try {
    assertPdfExportNotRequested(sp.format);
    const filters = parseProjectCashFlowFilters(sp);
    if (sp.format === "json") {
      const data = await getProjectCashFlowReport(projectId, filters, auth.ctx);
      return NextResponse.json(data);
    }
    const { content, filename } = await exportProjectCashFlowCsv(projectId, filters, auth.ctx);
    return csvResponse(content, filename);
  } catch (e) {
    return reportExportErrorResponse(e);
  }
}
