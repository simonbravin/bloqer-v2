import { NextRequest, NextResponse } from "next/server";
import { exportPortfolioProfitabilityCsv, exportPortfolioProfitabilityXlsx } from "@bloqer/services";
import { exportPortfolioProfitabilityPdf } from "@bloqer/report-pdf";
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
    if (fmt === "pdf") {
      const { buffer, filename } = await exportPortfolioProfitabilityPdf(auth.ctx, sp);
      return pdfResponse(buffer, filename);
    }
    if (fmt === "xlsx") {
      const { buffer, filename } = await exportPortfolioProfitabilityXlsx(auth.ctx, sp);
      return xlsxResponse(buffer, filename);
    }
    if (fmt === "csv") {
      const { content, filename } = await exportPortfolioProfitabilityCsv(auth.ctx, sp);
      return csvResponse(content, filename);
    }
    return NextResponse.json({ error: "Formato no soportado" }, { status: 400 });
  } catch (e) {
    return reportExportErrorResponse(e);
  }
}
