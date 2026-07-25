import { NextRequest, NextResponse } from "next/server";
import {
  exportJournalBookCsv,
  exportJournalBookXlsx,
  listPostedJournalBook,
} from "@bloqer/services";
import { exportJournalBookPdf } from "@bloqer/report-pdf";
import {
  csvResponse,
  pdfResponse,
  reportExportErrorResponse,
  requireReportExportContext,
  searchParamsRecord,
  xlsxResponse,
} from "@/lib/report-export-http";
import { parseAccountingDateRange } from "../_parse";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireReportExportContext();
  if (!auth.ok) return auth.response;
  const sp = searchParamsRecord(req);
  const input = parseAccountingDateRange(sp);
  try {
    const fmt = (sp.format ?? "csv").toLowerCase();
    if (fmt === "json") {
      return NextResponse.json(await listPostedJournalBook(auth.ctx, { ...input, page: 1, pageSize: 500 }));
    }
    if (fmt === "pdf") {
      const { buffer, filename } = await exportJournalBookPdf(input, auth.ctx);
      return pdfResponse(buffer, filename);
    }
    if (fmt === "xlsx") {
      const { buffer, filename } = await exportJournalBookXlsx(input, auth.ctx);
      return xlsxResponse(buffer, filename);
    }
    if (fmt === "csv") {
      const { content, filename } = await exportJournalBookCsv(input, auth.ctx);
      return csvResponse(content, filename);
    }
    return NextResponse.json({ error: "Formato no soportado" }, { status: 400 });
  } catch (e) {
    return reportExportErrorResponse(e);
  }
}
