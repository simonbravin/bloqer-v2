import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { exportAccountLedgerCsv, getAccountLedgerReport } from "@bloqer/services";
import { exportAccountLedgerPdf } from "@bloqer/report-pdf";
import {
  csvResponse,
  pdfResponse,
  reportExportErrorResponse,
  requireReportExportContext,
  searchParamsRecord,
} from "@/lib/report-export-http";
import { parseAccountingDateRange } from "../_parse";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireReportExportContext();
  if (!auth.ok) return auth.response;
  const sp = searchParamsRecord(req);
  const accountId = z.string().uuid().safeParse(sp.accountId);
  if (!accountId.success) {
    return NextResponse.json({ error: "accountId requerido" }, { status: 400 });
  }
  const range = parseAccountingDateRange(sp);
  const input = { ...range, accountId: accountId.data };
  try {
    const fmt = (sp.format ?? "csv").toLowerCase();
    if (fmt === "json") {
      return NextResponse.json(await getAccountLedgerReport(auth.ctx, input));
    }
    if (fmt === "pdf") {
      const { buffer, filename } = await exportAccountLedgerPdf(input, auth.ctx);
      return pdfResponse(buffer, filename);
    }
    if (fmt === "csv") {
      const { content, filename } = await exportAccountLedgerCsv(input, auth.ctx);
      return csvResponse(content, filename);
    }
    return NextResponse.json({ error: "Formato no soportado" }, { status: 400 });
  } catch (e) {
    return reportExportErrorResponse(e);
  }
}
