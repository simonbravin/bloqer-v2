import { NextRequest, NextResponse } from "next/server";
import {
  exportProcurementDeviationCsv,
  exportProcurementDeviationPdf,
  getProcurementDeviationReport,
  parseProcurementReportFilters,
} from "@bloqer/services";
import {
  csvResponse,
  pdfResponse,
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
    const filters = parseProcurementReportFilters(sp);
    const fmt = (sp.format ?? "csv").toLowerCase();
    if (fmt === "json") {
      const data = await getProcurementDeviationReport(projectId, filters, auth.ctx);
      return NextResponse.json(data);
    }
    if (fmt === "pdf") {
      const { buffer, filename } = await exportProcurementDeviationPdf(projectId, filters, auth.ctx);
      return pdfResponse(buffer, filename);
    }
    if (fmt === "csv") {
      const { content, filename } = await exportProcurementDeviationCsv(
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
