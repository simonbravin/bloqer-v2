import { z } from "zod";
import { compareDecimal } from "@bloqer/utils";
import { moneyAmountString, ratePctString } from "./money";

const decimalOptional = moneyAmountString
  .refine((value) => compareDecimal(value, "0") >= 0 && compareDecimal(value, "99999999999999.99") <= 0,
    "El monto debe ser no negativo y respetar la precisión permitida")
  .optional()
  .nullable();

const pct = ratePctString.refine((value) => compareDecimal(value, "0") >= 0 && compareDecimal(value, "9999.9999") <= 0,
  "El porcentaje debe ser no negativo y respetar la precisión permitida");

const overReceiptPct = pct
  .refine((v) => compareDecimal(v, "5") <= 0, {
    message: "La tolerancia de sobrecantidad debe estar entre 0 y 5%",
  });

const invoiceMatchPct = pct
  .refine((v) => compareDecimal(v, "25") <= 0, {
    message: "La tolerancia de matching factura debe estar entre 0 y 25%",
  });

export const upsertCompanyProcurementSettingsSchema = z
  .object({
    poApprovalThresholdArs: decimalOptional,
    purchaseRequestRequiredAboveArs: decimalOptional,
    minQuotesRequired: z.coerce.number().int().min(1).max(10).optional(),
    maxQuotesAllowed: z.coerce.number().int().min(1).max(20).optional(),
    quoteRequiredCategories: z.array(z.string()).nullable().optional(),
    allowDirectPo: z.boolean().optional(),
    allowSelfApproval: z.boolean().optional(),
    allowAuthorizeAndCommit: z.boolean().optional(),
    autoConfirmOnApprove: z.boolean().optional(),
    autoDraftApInvoiceOnReceipt: z.boolean().optional(),
    allowEmergencyDirectPo: z.boolean().optional(),
    approvalSlaHours: z.coerce.number().int().min(1).max(720).optional(),
    deliveryOverdueGraceDays: z.coerce.number().int().min(0).max(60).optional(),
    neededByOverdueGraceDays: z.coerce.number().int().min(0).max(60).optional(),
    receiptToInvoiceSlaDays: z.coerce.number().int().min(0).max(60).optional(),
    deliveryAlertsEnabled: z.boolean().optional(),
    neededByAlertsEnabled: z.boolean().optional(),
    receiptToInvoiceAlertsEnabled: z.boolean().optional(),
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
      compareDecimal(data.varianceSoftAlertPct, data.varianceNoteRequiredPct) > 0
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
      compareDecimal(data.varianceSoftAlertPct, data.varianceExtraApprovalPct) >= 0
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
