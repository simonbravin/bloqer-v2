import { z } from "zod";

const decimalOptional = z
  .string()
  .regex(/^\d+(\.\d+)?$/, "Monto inválido")
  .optional()
  .nullable();

const pct = z.string().regex(/^\d+(\.\d+)?$/, "Porcentaje inválido");

export const upsertCompanyProcurementSettingsSchema = z
  .object({
    poApprovalThresholdArs: decimalOptional,
    purchaseRequestRequiredAboveArs: decimalOptional,
    minQuotesRequired: z.coerce.number().int().min(1).max(10).optional(),
    maxQuotesAllowed: z.coerce.number().int().min(1).max(20).optional(),
    allowDirectPo: z.coerce.boolean().optional(),
    allowSelfApproval: z.coerce.boolean().optional(),
    allowEmergencyDirectPo: z.coerce.boolean().optional(),
    approvalSlaHours: z.coerce.number().int().min(1).max(720).optional(),
    varianceSoftAlertPct: pct.optional(),
    varianceNoteRequiredPct: pct.optional(),
    varianceExtraApprovalPct: pct.optional(),
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
        message: "El umbral de alerta debe ser menor al de nota obligatoria",
        path: ["varianceSoftAlertPct"],
      });
    }
  });

export type UpsertCompanyProcurementSettingsInput = z.infer<
  typeof upsertCompanyProcurementSettingsSchema
>;
