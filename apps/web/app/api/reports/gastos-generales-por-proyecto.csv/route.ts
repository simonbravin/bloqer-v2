import { NextRequest, NextResponse } from "next/server";
import { exportOverheadByProjectCsv, exportOverheadByProjectXlsx } from "@bloqer/services";
import { exportOverheadByProjectPdf } from "@bloqer/report-pdf";
import {
  csvResponse,
  pdfResponse,
  reportExportErrorResponse,
  requireReportExportContext,
  searchParamsRecord,
  xlsxResponse,
} from "@/lib/report-export-http";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireReportExportContext();
  if (!auth.ok) return auth.response;
  const sp = searchParamsRecord(req);
  try {
    const fmt = (sp.format ?? "csv").toLowerCase();
    const filters = {
      periodFrom: sp.periodFrom ?? sp.dateFrom,
      periodTo: sp.periodTo ?? sp.dateTo,
    };
    if (fmt === "pdf") {
      const { buffer, filename } = await exportOverheadByProjectPdf(auth.ctx, filters);
      return pdfResponse(buffer, filename);
    }
    if (fmt === "xlsx") {
      const { buffer, filename } = await exportOverheadByProjectXlsx(auth.ctx, filters);
      return xlsxResponse(buffer, filename);
    }
    if (fmt === "csv") {
      const { content, filename } = await exportOverheadByProjectCsv(auth.ctx, filters);
      return csvResponse(content, filename);
    }
    return NextResponse.json({ error: "Formato no soportado" }, { status: 400 });
  } catch (e) {
    return reportExportErrorResponse(e);
  }
}
