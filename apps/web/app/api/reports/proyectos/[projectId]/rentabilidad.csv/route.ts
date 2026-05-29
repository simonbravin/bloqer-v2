import { NextRequest, NextResponse } from "next/server";
import {
  exportProjectProfitabilityCsv,
  exportProjectProfitabilityPdf,
  getProjectProfitabilityReport,
  parseCostVarianceLayer,
  parseCurrencyView,
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
      budgetId: sp.budgetId,
      costLayer: parseCostVarianceLayer(sp.costLayer),
      revenueBasis: sp.revenueBasis === "invoiced" ? ("invoiced" as const) : ("certified" as const),
      currencyView: parseCurrencyView(sp.currencyView),
    };
    const fmt = (sp.format ?? "csv").toLowerCase();
    if (fmt === "json") {
      const data = await getProjectProfitabilityReport(projectId, filters, auth.ctx);
      return NextResponse.json(data);
    }
    if (fmt === "csv") {
      const { content, filename } = await exportProjectProfitabilityCsv(
        projectId,
        filters,
        auth.ctx,
      );
      return csvResponse(content, filename);
    }
    if (fmt === "pdf") {
      const { buffer, filename } = await exportProjectProfitabilityPdf(
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
