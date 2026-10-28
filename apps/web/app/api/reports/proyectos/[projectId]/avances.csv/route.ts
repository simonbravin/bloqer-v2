import { NextRequest, NextResponse } from "next/server";
import {
  exportProjectProgressCsv,
  exportProjectProgressXlsx,
  getProjectProgressReport,
  parseProjectProgressFilters,
} from "@bloqer/services";
import { exportProjectProgressPdf } from "@bloqer/report-pdf";
import {
  csvResponse,
  pdfResponse,
  xlsxResponse,
  reportExportErrorResponse,
  requireReportExportContext,
  searchParamsRecord,
} from "@/lib/report-export-http";

export const runtime = "nodejs";

export async function GET(req: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  const auth = await requireReportExportContext();
  if (!auth.ok) return auth.response;
  const { projectId } = await context.params;
  const params = searchParamsRecord(req);
  try {
    const filters = parseProjectProgressFilters(params);
    switch ((params.format ?? "csv").toLowerCase()) {
      case "json":
        return NextResponse.json(await getProjectProgressReport(projectId, filters, auth.ctx), {
          headers: { "Cache-Control": "private, no-store" },
        });
      case "csv": {
        const { content, filename } = await exportProjectProgressCsv(projectId, filters, auth.ctx);
        return csvResponse(content, filename);
      }
      case "xlsx": {
        const { buffer, filename } = await exportProjectProgressXlsx(projectId, filters, auth.ctx);
        return xlsxResponse(buffer, filename);
      }
      case "pdf": {
        const { buffer, filename } = await exportProjectProgressPdf(projectId, filters, auth.ctx);
        return pdfResponse(buffer, filename);
      }
      default:
        return NextResponse.json({ error: "Formato no soportado" }, { status: 400 });
    }
  } catch (error) {
    return reportExportErrorResponse(error);
  }
}
