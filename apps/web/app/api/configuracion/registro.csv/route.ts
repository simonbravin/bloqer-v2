import { NextRequest, NextResponse } from "next/server";
import {
  exportTenantAuditLogCsv,
  exportTenantAuditLogPdf,
  resolveTenantAuditLogExportFilters,
} from "@bloqer/services";
import { exportTenantAuditLogUrlFiltersSchema } from "@bloqer/validators";
import { canViewTenantAuditLog } from "@/lib/configuracion-subnav";
import {
  csvResponse,
  pdfResponse,
  reportExportErrorResponse,
  requireReportExportContext,
  searchParamsRecord,
} from "@/lib/report-export-http";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireReportExportContext();
  if (!auth.ok) return auth.response;
  if (!canViewTenantAuditLog(auth.ctx.roles)) {
    return NextResponse.json({ error: "Sin permisos para exportar el registro de actividad" }, { status: 403 });
  }

  const sp = searchParamsRecord(req);
  const parsed = exportTenantAuditLogUrlFiltersSchema.safeParse(sp);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ") || "Filtros inválidos";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const filters = resolveTenantAuditLogExportFilters(parsed.data);
  const fmt = (sp.format ?? "csv").toLowerCase();

  try {
    if (fmt === "pdf") {
      const { buffer, filename } = await exportTenantAuditLogPdf(filters, auth.ctx, parsed.data);
      return pdfResponse(buffer, filename);
    }
    if (fmt === "csv") {
      const { content, filename } = await exportTenantAuditLogCsv(filters, auth.ctx);
      return csvResponse(content, filename);
    }
    return NextResponse.json({ error: "Formato no soportado" }, { status: 400 });
  } catch (e) {
    return reportExportErrorResponse(e);
  }
}
