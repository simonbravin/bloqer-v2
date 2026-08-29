import { NextRequest, NextResponse } from "next/server";
import { exportProjectPortfolioCsv, exportProjectPortfolioXlsx } from "@bloqer/services";
import { exportProjectPortfolioPdf } from "@bloqer/report-pdf";
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
      const { buffer, filename } = await exportProjectPortfolioPdf(auth.ctx, sp);
      return pdfResponse(buffer, filename);
    }
    if (fmt === "xlsx") {
      const { buffer, filename } = await exportProjectPortfolioXlsx(auth.ctx, sp);
      return xlsxResponse(buffer, filename);
    }
    if (fmt === "csv") {
      const { content, filename } = await exportProjectPortfolioCsv(auth.ctx, sp);
      return csvResponse(content, filename);
    }
    return NextResponse.json({ error: "Formato no soportado" }, { status: 400 });
  } catch (e) {
    return reportExportErrorResponse(e);
  }
}
