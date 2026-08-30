import { z } from "zod";

const decimalOptional = z
  .string()
  .regex(/^\d+(\.\d+)?$/, "Monto inválido")
  .optional()
  .nullable();

const pct = z.string().regex(/^\d+(\.\d+)?$/, "Porcentaje inválido");

const overReceiptPct = z
  .string()
  .regex(/^\d+(\.\d+)?$/, "Porcentaje inválido")
  .refine((v) => Number(v) >= 0 && Number(v) <= 5, {
    message: "La tolerancia de sobrecantidad debe estar entre 0 y 5%",
  });

const invoiceMatchPct = z
  .string()
  .regex(/^\d+(\.\d+)?$/, "Porcentaje inválido")
  .refine((v) => Number(v) >= 0 && Number(v) <= 25, {
    message: "La tolerancia de matching factura debe estar entre 0 y 25%",
  });

export const upsertCompanyProcurementSettingsSchema = z
  .object({
    poApprovalThresholdArs: decimalOptional,
    purchaseRequestRequiredAboveArs: decimalOptional,
    minQuotesRequired: z.coerce.number().int().min(1).max(10).optional(),
    maxQuotesAllowed: z.coerce.number().int().min(1).max(20).optional(),
    allowDirectPo: z.coerce.boolean().optional(),
    allowSelfApproval: z.coerce.boolean().optional(),
    allowAuthorizeAndCommit: z.coerce.boolean().optional(),
    autoConfirmOnApprove: z.coerce.boolean().optional(),
    autoDraftApInvoiceOnReceipt: z.coerce.boolean().optional(),
    allowEmergencyDirectPo: z.coerce.boolean().optional(),
    approvalSlaHours: z.coerce.number().int().min(1).max(720).optional(),
    deliveryOverdueGraceDays: z.coerce.number().int().min(0).max(60).optional(),
    neededByOverdueGraceDays: z.coerce.number().int().min(0).max(60).optional(),
    receiptToInvoiceSlaDays: z.coerce.number().int().min(0).max(60).optional(),
    deliveryAlertsEnabled: z.coerce.boolean().optional(),
    neededByAlertsEnabled: z.coerce.boolean().optional(),
    receiptToInvoiceAlertsEnabled: z.coerce.boolean().optional(),
    varianceSoftAlertPct: pct.optional(),
    varianceNoteRequiredPct: pct.optional(),
    varianceExtraApprovalPct: pct.optional(),
    overReceiptTolerancePct: overReceiptPct.optional(),
    invoiceMatchTolerancePct: invoiceMatchPct.optional(),
    apPaymentNotificationChannel: z.enum(["IN_APP", "IN_APP_AND_EMAIL"]).optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.minQuotesRequired != null &&
      data.maxQuotesAllowed != null &&
      data.minQuotesRequired > data.maxQuotesAllowed
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Las cotizaciones mínimas no pueden superar el máximo",
        path: ["minQuotesRequired"],
      });
    }
    if (
      data.varianceSoftAlertPct != null &&
      data.varianceNoteRequiredPct != null &&
      Number(data.varianceSoftAlertPct) > Number(data.varianceNoteRequiredPct)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "El umbral de alerta debe ser menor o igual al de nota obligatoria",
        path: ["varianceSoftAlertPct"],
      });
    }
    if (
      data.varianceSoftAlertPct != null &&
      data.varianceExtraApprovalPct != null &&
      Number(data.varianceSoftAlertPct) >= Number(data.varianceExtraApprovalPct)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "El umbral de nota/alerta debe ser menor al de aprobación administración",
        path: ["varianceSoftAlertPct"],
      });
    }
  });

export type UpsertCompanyProcurementSettingsInput = z.infer<
  typeof upsertCompanyProcurementSettingsSchema
>;
