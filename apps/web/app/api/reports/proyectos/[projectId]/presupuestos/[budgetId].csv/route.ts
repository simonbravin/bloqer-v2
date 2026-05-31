import { NextRequest, NextResponse } from "next/server";
import {
  buildBudgetWbsExportPayload,
  exportBudgetWbsCsv,
  exportBudgetWbsXlsx,
  parseBudgetWbsExportFilters,
} from "@bloqer/services";
import { exportBudgetWbsPdf } from "@bloqer/report-pdf";
import {
  csvResponse,
  pdfResponse,
  reportExportErrorResponse,
  requireReportExportContext,
  searchParamsRecord,
  xlsxResponse,
} from "@/lib/report-export-http";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ projectId: string; budgetId: string }> },
) {
  const auth = await requireReportExportContext();
  if (!auth.ok) return auth.response;
  const { projectId, budgetId } = await ctx.params;
  const sp = searchParamsRecord(req);
  try {
    const filters = parseBudgetWbsExportFilters(sp);
    const fmt = (sp.format ?? "csv").toLowerCase();
    if (fmt === "json") {
      const data = await buildBudgetWbsExportPayload(budgetId, projectId, filters, auth.ctx);
      return NextResponse.json(data);
    }
    if (fmt === "pdf") {
      const { buffer, filename } = await exportBudgetWbsPdf(budgetId, projectId, filters, auth.ctx);
      return pdfResponse(buffer, filename);
    }
    if (fmt === "xlsx") {
      const { buffer, filename } = await exportBudgetWbsXlsx(budgetId, projectId, filters, auth.ctx);
      return xlsxResponse(buffer, filename);
    }
    if (fmt === "csv") {
      const { content, filename } = await exportBudgetWbsCsv(budgetId, projectId, filters, auth.ctx);
      return csvResponse(content, filename);
    }
    return NextResponse.json({ error: "Formato no soportado" }, { status: 400 });
  } catch (e) {
    return reportExportErrorResponse(e);
  }
}
