import { NextRequest, NextResponse } from "next/server";
import {
  exportCompanySupplierInvoicesCsv,
  exportCompanySupplierInvoicesXlsx,
  parseCompanySupplierInvoiceExportFilters,
} from "@bloqer/services";
import { exportCompanySupplierInvoicesPdf } from "@bloqer/report-pdf";
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
    const filters = parseCompanySupplierInvoiceExportFilters(sp);
    const fmt = (sp.format ?? "csv").toLowerCase();
    if (fmt === "pdf") {
      const { buffer, filename } = await exportCompanySupplierInvoicesPdf(filters, auth.ctx);
      return pdfResponse(buffer, filename);
    }
    if (fmt === "csv") {
      const { content, filename } = await exportCompanySupplierInvoicesCsv(filters, auth.ctx);
      return csvResponse(content, filename);
    }
    if (fmt === "xlsx") {
      const { buffer, filename } = await exportCompanySupplierInvoicesXlsx(filters, auth.ctx);
      return xlsxResponse(buffer, filename);
    }
    return NextResponse.json({ error: "Formato no soportado" }, { status: 400 });
  } catch (e) {
    return reportExportErrorResponse(e);
  }
}
