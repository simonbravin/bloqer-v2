import { NextRequest, NextResponse } from "next/server";
import {
  exportResourceVarianceCsv,
  getResourceVarianceReport,
  isResourceBoardCategory,
  parseProjectReportDateFilters,
  type ResourceBoardCategory,
} from "@bloqer/services";
import {
  csvResponse,
  reportExportErrorResponse,
  requireReportExportContext,
  searchParamsRecord,
} from "@/lib/report-export-http";

export const runtime = "nodejs";

function parseCostCategory(raw: string | undefined): ResourceBoardCategory | null {
  if (!raw) return null;
  const v = raw.trim().toUpperCase();
  if (isResourceBoardCategory(v)) return v;
  return null;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ projectId: string }> }) {
  const auth = await requireReportExportContext();
  if (!auth.ok) return auth.response;
  const { projectId } = await ctx.params;
  const sp = searchParamsRecord(req);
  const costCategory =
    parseCostCategory(sp.costCategory) ?? parseCostCategory(sp.costType);
  if (!costCategory) {
    return NextResponse.json(
      { error: "Parámetro costCategory requerido (LABOR | EQUIPMENT)" },
      { status: 400 },
    );
  }
  try {
    const filters = parseProjectReportDateFilters(sp);
    const fmt = (sp.format ?? "csv").toLowerCase();
    if (fmt === "json") {
      const data = await getResourceVarianceReport(projectId, costCategory, filters, auth.ctx);
      return NextResponse.json(data);
    }
    if (fmt === "csv") {
      const { content, filename } = await exportResourceVarianceCsv(
        projectId,
        costCategory,
        filters,
        auth.ctx,
      );
      return csvResponse(content, filename);
    }
    return NextResponse.json({ error: "Formato no soportado" }, { status: 400 });
  } catch (e) {
    return reportExportErrorResponse(e);
  }
}
