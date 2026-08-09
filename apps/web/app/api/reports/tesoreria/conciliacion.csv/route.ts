import { NextRequest } from "next/server";
import { z } from "zod";
import { exportBankReconciliationStatusCsv } from "@bloqer/services";
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
  const accountId = z.string().uuid().safeParse(sp.accountId || undefined).success
    ? sp.accountId
    : undefined;
  try {
    const { content, filename } = await exportBankReconciliationStatusCsv(auth.ctx, {
      accountId: accountId || undefined,
    });
    return csvResponse(content, filename);
  } catch (e) {
    return reportExportErrorResponse(e);
  }
}
