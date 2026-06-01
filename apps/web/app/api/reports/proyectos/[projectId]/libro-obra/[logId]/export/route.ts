import { NextRequest, NextResponse } from "next/server";
import { exportJobsiteLogPdf } from "@bloqer/report-pdf";
import {
  pdfResponse,
  reportExportErrorResponse,
  requireReportExportContext,
  searchParamsRecord,
} from "@/lib/report-export-http";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ projectId: string; logId: string }> },
) {
  const auth = await requireReportExportContext();
  if (!auth.ok) return auth.response;

  const { projectId, logId } = await ctx.params;
  const sp = searchParamsRecord(req);
  const fmt = (sp.format ?? "pdf").toLowerCase();

  if (fmt !== "pdf") {
    return NextResponse.json({ error: "Formato no soportado. Usá format=pdf." }, { status: 400 });
  }

  try {
    const { buffer, filename } = await exportJobsiteLogPdf(logId, projectId, auth.ctx);
    return pdfResponse(buffer, filename);
  } catch (e) {
    return reportExportErrorResponse(e);
  }
}
