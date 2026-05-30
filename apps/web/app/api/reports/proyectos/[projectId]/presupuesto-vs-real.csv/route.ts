import { NextRequest, NextResponse } from "next/server";
import {
  exportBudgetVarianceCsv,
  getBudgetVarianceReport,
  getBudgetCompositionReport,
  parseBudgetVarianceFilters,
} from "@bloqer/services";
import { exportBudgetVariancePdf } from "@bloqer/report-pdf";
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
    const filters = parseBudgetVarianceFilters(sp);
    const fmt = (sp.format ?? "csv").toLowerCase();
    if (fmt === "json") {
      if (sp.report === "composition") {
        const data = await getBudgetCompositionReport(projectId, { budgetId: filters.budgetId }, auth.ctx);
        return NextResponse.json(data);
      }
      const data = await getBudgetVarianceReport(projectId, filters, auth.ctx);
      return NextResponse.json(data);
    }
    if (fmt === "pdf") {
      const { buffer, filename } = await exportBudgetVariancePdf(projectId, filters, auth.ctx);
      return pdfResponse(buffer, filename);
    }
    if (fmt === "csv") {
      const { content, filename } = await exportBudgetVarianceCsv(projectId, filters, auth.ctx);
      return csvResponse(content, filename);
    }
    return NextResponse.json({ error: "Formato no soportado" }, { status: 400 });
  } catch (e) {
    return reportExportErrorResponse(e);
  }
}
