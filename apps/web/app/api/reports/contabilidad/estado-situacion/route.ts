import { NextRequest, NextResponse } from "next/server";
import {
  exportStatementOfFinancialPositionCsv,
  exportStatementOfFinancialPositionXlsx,
  getStatementOfFinancialPosition,
} from "@bloqer/services";
import { exportStatementOfFinancialPositionPdf } from "@bloqer/report-pdf";
import {
  csvResponse,
  pdfResponse,
  reportExportErrorResponse,
  requireReportExportContext,
  searchParamsRecord,
  xlsxResponse,
} from "@/lib/report-export-http";
import { parseAccountingAsOf } from "../_parse";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireReportExportContext();
  if (!auth.ok) return auth.response;
  const sp = searchParamsRecord(req);
  const input = parseAccountingAsOf(sp);
  try {
    const fmt = (sp.format ?? "csv").toLowerCase();
    if (fmt === "json") {
      return NextResponse.json(await getStatementOfFinancialPosition(auth.ctx, input));
    }
    if (fmt === "pdf") {
      const { buffer, filename } = await exportStatementOfFinancialPositionPdf(input, auth.ctx);
      return pdfResponse(buffer, filename);
    }
    if (fmt === "xlsx") {
      const { buffer, filename } = await exportStatementOfFinancialPositionXlsx(input, auth.ctx);
      return xlsxResponse(buffer, filename);
    }
    if (fmt === "csv") {
      const { content, filename } = await exportStatementOfFinancialPositionCsv(input, auth.ctx);
      return csvResponse(content, filename);
    }
    return NextResponse.json({ error: "Formato no soportado" }, { status: 400 });
  } catch (e) {
    return reportExportErrorResponse(e);
  }
}
