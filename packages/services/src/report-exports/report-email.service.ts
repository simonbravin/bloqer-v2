import { sendReportByEmailInputSchema, type SendReportByEmailInputValidated } from "@bloqer/validators";
import { isEmailConfigured } from "@bloqer/config";
import { sendEmail, escapeHtml } from "@bloqer/email";
import { ServiceContext, ServiceError } from "../types";
import {
  createEmailDeliveryLog,
  markEmailDeliveryFailed,
  markEmailDeliverySent,
  markEmailDeliverySkipped,
} from "../email-delivery/email-delivery-log.service";
import {
  exportCashPositionCsv,
  exportPayableAgingCsv,
  exportProjectCashFlowCsv,
  exportProjectCostControlCsv,
  exportReceivableAgingCsv,
  exportStockBalanceCsv,
  exportStockMovementsCsv,
  exportTreasuryCashFlowCsv,
  exportTreasuryMovementsCsv,
  parseAgingFilters,
  parseCashFlowFilters,
  parseCashPositionFilters,
  parseCostControlFilters,
  parseMovementReportFilters,
  parseProjectCashFlowFilters,
  parseStockBalanceFilters,
  parseStockMovementFilters,
} from "./report-export.service";
import { exportPayableAgingPdf, exportProjectCostControlPdf, exportReceivableAgingPdf } from "./report-pdf-export.service";

const REPORT_LABEL: Record<SendReportByEmailInputValidated["reportType"], string> = {
  AR_AGING: "Aging — Cuentas por cobrar",
  AP_AGING: "Aging — Cuentas por pagar",
  PROJECT_COST_CONTROL: "Control de costos (proyecto)",
  TREASURY_CASH_POSITION: "Tesorería — Posición de caja",
  TREASURY_MOVEMENTS: "Tesorería — Movimientos",
  TREASURY_CASH_FLOW: "Tesorería — Flujo de caja",
  INVENTORY_STOCK: "Inventario — Stock actual",
  INVENTORY_MOVEMENTS: "Inventario — Movimientos",
  PROJECT_CASH_FLOW: "Proyecto — Flujo de caja",
};

function sanitizeEmailSubject(s: string): string {
  return s.replace(/[\r\n\u2028\u2029]+/g, " ").trim().slice(0, 998);
}

function asFilterRecord(p: Record<string, string>): Record<string, string | undefined> {
  return p;
}

export type SendReportByEmailResult = {
  ok: boolean;
  provider: "resend" | "disabled";
  skippedReason?: "email_not_configured";
  filename: string;
  format: "csv" | "pdf";
  recipientEmail: string;
  messageId?: string;
  error?: string;
};

async function buildReportAttachment(
  input: SendReportByEmailInputValidated,
  ctx: ServiceContext,
): Promise<{ filename: string; content: Buffer | string; contentType: string }> {
  const sp = asFilterRecord(input.params ?? {});
  switch (input.reportType) {
    case "AR_AGING": {
      const f = parseAgingFilters(sp);
      if (input.format === "pdf") {
        const { buffer, filename } = await exportReceivableAgingPdf(f, ctx);
        return { filename, content: buffer, contentType: "application/pdf" };
      }
      const { content, filename } = await exportReceivableAgingCsv(f, ctx);
      return { filename, content: Buffer.from(content, "utf-8"), contentType: "text/csv; charset=utf-8" };
    }
    case "AP_AGING": {
      const f = parseAgingFilters(sp);
      if (input.format === "pdf") {
        const { buffer, filename } = await exportPayableAgingPdf(f, ctx);
        return { filename, content: buffer, contentType: "application/pdf" };
      }
      const { content, filename } = await exportPayableAgingCsv(f, ctx);
      return { filename, content: Buffer.from(content, "utf-8"), contentType: "text/csv; charset=utf-8" };
    }
    case "PROJECT_COST_CONTROL": {
      const pid = input.projectId!;
      const f = parseCostControlFilters(sp);
      if (input.format === "pdf") {
        const { buffer, filename } = await exportProjectCostControlPdf(pid, f, ctx);
        return { filename, content: buffer, contentType: "application/pdf" };
      }
      const { content, filename } = await exportProjectCostControlCsv(pid, f, ctx);
      return { filename, content: Buffer.from(content, "utf-8"), contentType: "text/csv; charset=utf-8" };
    }
    case "TREASURY_CASH_POSITION": {
      const { content, filename } = await exportCashPositionCsv(parseCashPositionFilters(sp), ctx);
      return { filename, content: Buffer.from(content, "utf-8"), contentType: "text/csv; charset=utf-8" };
    }
    case "TREASURY_MOVEMENTS": {
      const { content, filename } = await exportTreasuryMovementsCsv(parseMovementReportFilters(sp), ctx);
      return { filename, content: Buffer.from(content, "utf-8"), contentType: "text/csv; charset=utf-8" };
    }
    case "TREASURY_CASH_FLOW": {
      const { content, filename } = await exportTreasuryCashFlowCsv(parseCashFlowFilters(sp), ctx);
      return { filename, content: Buffer.from(content, "utf-8"), contentType: "text/csv; charset=utf-8" };
    }
    case "INVENTORY_STOCK": {
      const { content, filename } = await exportStockBalanceCsv(parseStockBalanceFilters(sp), ctx);
      return { filename, content: Buffer.from(content, "utf-8"), contentType: "text/csv; charset=utf-8" };
    }
    case "INVENTORY_MOVEMENTS": {
      const { content, filename } = await exportStockMovementsCsv(parseStockMovementFilters(sp), ctx);
      return { filename, content: Buffer.from(content, "utf-8"), contentType: "text/csv; charset=utf-8" };
    }
    case "PROJECT_CASH_FLOW": {
      const pid = input.projectId!;
      const { content, filename } = await exportProjectCashFlowCsv(pid, parseProjectCashFlowFilters(sp), ctx);
      return { filename, content: Buffer.from(content, "utf-8"), contentType: "text/csv; charset=utf-8" };
    }
    default: {
      const _exhaustive: never = input.reportType;
      throw new ServiceError("VALIDATION", `Reporte no soportado: ${_exhaustive}`);
    }
  }
}

/**
 * Phase 9C — manual report email with attachment. Reuses CSV/PDF builders (same permissions as exports).
 */
export async function sendReportByEmail(
  raw: unknown,
  ctx: ServiceContext,
): Promise<SendReportByEmailResult> {
  const parsed = sendReportByEmailInputSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((e) => e.message).join("; ") || "validación";
    throw new ServiceError("VALIDATION", msg);
  }
  const input = parsed.data;

  const defaultSubject = `Bloqer — ${REPORT_LABEL[input.reportType]} (${input.format.toUpperCase()})`;
  const subject = sanitizeEmailSubject(input.subject?.trim() ? input.subject.trim() : defaultSubject);

  const minuteBucket = Math.floor(Date.now() / 60_000);
  const idempotencyKey = `manual-report:${ctx.tenantId}:${input.reportType}:${input.format}:${input.recipientEmail.toLowerCase()}:${minuteBucket}`;

  const { id: logId } = await createEmailDeliveryLog(
    {
      recipientEmail: input.recipientEmail,
      subject,
      emailType: "REPORT_MANUAL",
      reportType: input.reportType,
      reportFormat: input.format,
      idempotencyKey,
      metadata: { source: "sendReportByEmail" },
    },
    ctx,
  );

  let attachment: { filename: string; content: Buffer | string; contentType: string };
  try {
    attachment = await buildReportAttachment(input, ctx);
  } catch (e) {
    const msg = e instanceof ServiceError ? e.message : "No se pudo generar el adjunto";
    await markEmailDeliveryFailed(logId, msg, ctx, "DISABLED");
    throw e;
  }

  if (!isEmailConfigured()) {
    await markEmailDeliverySkipped(logId, "email_not_configured", ctx);
    return {
      ok: true,
      provider: "disabled",
      skippedReason: "email_not_configured",
      filename: attachment.filename,
      format: input.format,
      recipientEmail: input.recipientEmail,
    };
  }

  const intro = input.message?.trim()
    ? escapeHtml(input.message.trim())
    : escapeHtml("Adjuntamos el reporte solicitado.");
  const html = `<!DOCTYPE html><html><body><p>${intro}</p><p style="font-size:12px;color:#666">Generado desde Bloqer. No respondas a este correo automático.</p></body></html>`;
  const text = `${input.message?.trim() || "Adjuntamos el reporte solicitado."}\n\n— Bloqer`;

  const sendResult = await sendEmail({
    to: input.recipientEmail,
    subject,
    html,
    text,
    attachments: [
      {
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType,
      },
    ],
  });

  const base: SendReportByEmailResult = {
    ok: sendResult.ok,
    provider: sendResult.provider,
    filename: attachment.filename,
    format: input.format,
    recipientEmail: input.recipientEmail,
    messageId: sendResult.messageId,
    error: sendResult.error,
  };

  if (!sendResult.ok) {
    await markEmailDeliveryFailed(logId, sendResult.error ?? "send_failed", ctx, "RESEND");
    return {
      ...base,
      ok: false,
      error: sendResult.error ?? "send_failed",
    };
  }

  if (sendResult.provider === "disabled") {
    await markEmailDeliverySkipped(logId, "email_not_configured", ctx);
    return {
      ...base,
      ok: true,
      provider: "disabled",
      skippedReason: "email_not_configured",
    };
  }

  await markEmailDeliverySent(logId, sendResult.messageId, ctx);
  return {
    ...base,
    ok: true,
  };
}
