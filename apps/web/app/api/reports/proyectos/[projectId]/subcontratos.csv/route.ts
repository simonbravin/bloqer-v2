import { NextRequest, NextResponse } from "next/server";
import {
  exportSubcontractVarianceCsv,
  getSubcontractVarianceReport,
  parseSubcontractReportFilters,
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
    const filters = parseSubcontractReportFilters(sp);
    const fmt = (sp.format ?? "csv").toLowerCase();
    if (fmt === "json") {
      const data = await getSubcontractVarianceReport(projectId, filters, auth.ctx);
      return NextResponse.json(data);
    }
    if (fmt === "csv") {
      const { content, filename } = await exportSubcontractVarianceCsv(
        projectId,
        filters,
        auth.ctx,
      );
      return csvResponse(content, filename);
    }
    return NextResponse.json({ error: "Formato no soportado" }, { status: 400 });
  } catch (e) {
    return reportExportErrorResponse(e);
  }
}
