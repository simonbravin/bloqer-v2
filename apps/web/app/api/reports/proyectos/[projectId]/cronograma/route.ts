import { NextRequest, NextResponse } from "next/server";
import { exportScheduleXlsx, parseScheduleExportFilters } from "@bloqer/services";
import { exportSchedulePdf } from "@bloqer/report-pdf";
import {
  pdfResponse,
  reportExportErrorResponse,
  requireReportExportContext,
  searchParamsRecord,
  xlsxResponse,
} from "@/lib/report-export-http";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ projectId: string }> }) {
  const auth = await requireReportExportContext();
  if (!auth.ok) return auth.response;
  const { projectId } = await ctx.params;
  const sp = searchParamsRecord(req);
  try {
    const filters = parseScheduleExportFilters(sp);
    const fmt = (sp.format ?? "").toLowerCase();
    if (fmt === "pdf") {
      const { buffer, filename } = await exportSchedulePdf(projectId, filters, auth.ctx);
      return pdfResponse(buffer, filename);
    }
    if (fmt === "xlsx") {
      const { buffer, filename } = await exportScheduleXlsx(projectId, filters, auth.ctx);
      return xlsxResponse(buffer, filename);
    }
    return NextResponse.json({ error: "Formato no soportado. Usá pdf o xlsx." }, { status: 400 });
  } catch (e) {
    return reportExportErrorResponse(e);
  }
}
