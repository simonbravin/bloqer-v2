import { NextRequest } from "next/server";
import {
  assertPdfExportNotRequested,
  exportCompanySupplierInvoicesCsv,
  parseCompanySupplierInvoiceExportFilters,
} from "@bloqer/services";
import {
  csvResponse,
  reportExportErrorResponse,
  requireReportExportContext,
  searchParamsRecord,
} from "@/lib/report-export-http";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireReportExportContext();
  if (!auth.ok) return auth.response;
  const sp = searchParamsRecord(req);
  try {
    assertPdfExportNotRequested(sp.format);
    const filters = parseCompanySupplierInvoiceExportFilters(sp);
    const { content, filename } = await exportCompanySupplierInvoicesCsv(filters, auth.ctx);
    return csvResponse(content, filename);
  } catch (e) {
    return reportExportErrorResponse(e);
  }
}
