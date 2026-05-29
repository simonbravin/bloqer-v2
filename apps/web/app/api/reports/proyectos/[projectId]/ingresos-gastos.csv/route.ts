import { NextRequest, NextResponse } from "next/server";
import {
  exportProjectIncomeExpenseCsv,
  exportProjectIncomeExpensePdf,
  getProjectIncomeExpenseReport,
  parseCurrencyView,
  parseProjectReportDateFilters,
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
    const filters = {
      ...parseProjectReportDateFilters(sp),
      currencyView: parseCurrencyView(sp.currencyView),
    };
    const fmt = (sp.format ?? "csv").toLowerCase();
    if (fmt === "json") {
      const data = await getProjectIncomeExpenseReport(projectId, filters, auth.ctx);
      return NextResponse.json(data);
    }
    if (fmt === "csv") {
      const { content, filename } = await exportProjectIncomeExpenseCsv(
        projectId,
        filters,
        auth.ctx,
      );
      return csvResponse(content, filename);
    }
    if (fmt === "pdf") {
      const { buffer, filename } = await exportProjectIncomeExpensePdf(
        projectId,
        filters,
        auth.ctx,
      );
      return pdfResponse(buffer, filename);
    }
    return NextResponse.json({ error: "Formato no soportado" }, { status: 400 });
  } catch (e) {
    return reportExportErrorResponse(e);
  }
}
