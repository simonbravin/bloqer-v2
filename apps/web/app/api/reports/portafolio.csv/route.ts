import { NextRequest } from "next/server";
import { exportProjectPortfolioCsv } from "@bloqer/services";
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
    const { content, filename } = await exportProjectPortfolioCsv(
      auth.ctx,
      searchParamsRecord(req),
    );
    return csvResponse(content, filename);
  } catch (e) {
    return reportExportErrorResponse(e);
  }
}
