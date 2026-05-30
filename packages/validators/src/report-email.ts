import { z } from "zod";

/** Manual report email (Phase 9C) — must match `sendReportByEmail` switch in @bloqer/report-pdf. */
export const manualReportTypeSchema = z.enum([
  "AR_AGING",
  "AP_AGING",
  "PROJECT_COST_CONTROL",
  "TREASURY_CASH_POSITION",
  "TREASURY_MOVEMENTS",
  "TREASURY_CASH_FLOW",
  "INVENTORY_STOCK",
  "INVENTORY_MOVEMENTS",
  "PROJECT_CASH_FLOW",
]);

export type ManualReportType = z.infer<typeof manualReportTypeSchema>;

const REPORT_TYPES_WITH_PDF = new Set<ManualReportType>([
  "AR_AGING",
  "AP_AGING",
  "PROJECT_COST_CONTROL",
]);

const REPORT_TYPES_NEED_PROJECT_ID = new Set<ManualReportType>([
  "PROJECT_COST_CONTROL",
  "PROJECT_CASH_FLOW",
]);

const paramsRecordSchema = z
  .record(z.string().max(64), z.string().max(512))
  .refine((o) => Object.keys(o).length <= 48, "Demasiados parámetros");

export const sendReportByEmailInputSchema = z
  .object({
    reportType: manualReportTypeSchema,
    format: z.enum(["csv", "pdf"]),
    recipientEmail: z.string().email().max(320),
    subject: z.string().max(200).optional(),
    message: z.string().max(2000).optional(),
    params: paramsRecordSchema.default({}),
    projectId: z.string().uuid().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.format === "pdf" && !REPORT_TYPES_WITH_PDF.has(data.reportType)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "PDF no disponible para este reporte",
        path: ["format"],
      });
    }
    if (REPORT_TYPES_NEED_PROJECT_ID.has(data.reportType) && !data.projectId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "projectId es obligatorio para este reporte",
        path: ["projectId"],
      });
    }
  });

export type SendReportByEmailInputValidated = z.infer<typeof sendReportByEmailInputSchema>;
