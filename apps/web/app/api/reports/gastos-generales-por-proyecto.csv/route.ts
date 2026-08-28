import { NextRequest } from "next/server";
import { exportOverheadByProjectCsv } from "@bloqer/services";
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
  try {
    const { content, filename } = await exportOverheadByProjectCsv(
      auth.ctx,
      searchParamsRecord(req),
    );
    return csvResponse(content, filename);
  } catch (e) {
    return reportExportErrorResponse(e);
  }
}
