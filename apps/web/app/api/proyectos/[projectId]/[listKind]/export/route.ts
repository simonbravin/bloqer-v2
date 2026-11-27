import { NextRequest, NextResponse } from "next/server";
import { exportProjectOperationalListXlsx, type ProjectOperationalListKind } from "@bloqer/services";
import { exportProjectOperationalListPdf } from "@bloqer/report-pdf";
import {
  pdfResponse,
  reportExportErrorResponse,
  requireReportExportContext,
  searchParamsRecord,
  xlsxResponse,
} from "@/lib/report-export-http";

export const runtime = "nodejs";

const LIST_KINDS: Record<string, ProjectOperationalListKind> = {
  "facturas-proveedor": "supplier-invoices",
  facturas: "sales-invoices",
  "ordenes-compra": "purchase-orders",
  "solicitudes-compra": "purchase-requests",
  recepciones: "purchase-receipts",
  pagos: "payments",
  cobranzas: "collections",
};

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ projectId: string; listKind: string }> },
) {
  const auth = await requireReportExportContext();
  if (!auth.ok) return auth.response;
  const { projectId, listKind } = await context.params;
  if (!Object.hasOwn(LIST_KINDS, listKind)) {
    return NextResponse.json({ error: "Listado no encontrado" }, { status: 404 });
  }
  const sp = searchParamsRecord(req);
  const format = (sp.format ?? "xlsx").toLowerCase();
  if (format !== "xlsx" && format !== "pdf") {
    return NextResponse.json({ error: "Formato no soportado" }, { status: 400 });
  }
  try {
    const kind = LIST_KINDS[listKind];
    if (format === "pdf") {
      const { buffer, filename } = await exportProjectOperationalListPdf(projectId, kind, sp, auth.ctx);
      return pdfResponse(buffer, filename);
    }
    const { buffer, filename } = await exportProjectOperationalListXlsx(projectId, kind, sp, auth.ctx);
    return xlsxResponse(buffer, filename);
  } catch (error) {
    return reportExportErrorResponse(error);
  }
}
