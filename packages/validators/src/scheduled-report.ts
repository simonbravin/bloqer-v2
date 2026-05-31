import { z } from "zod";

/** Closed catalog — must match `scheduled-report-registry` in services. */
export const tenantScheduledReportKeySchema = z.enum([
  "TENANT_AR_AGING",
  "TENANT_AP_AGING",
  "TENANT_TREASURY_CASH_POSITION",
  "TENANT_TREASURY_MOVEMENTS",
  "TENANT_TREASURY_CASH_FLOW",
  "TENANT_INVENTORY_STOCK",
  "TENANT_INVENTORY_MOVEMENTS",
  "TENANT_CORPORATE_PAYABLES",
  "TENANT_CORPORATE_SUPPLIER_INVOICES",
]);

export const projectScheduledReportKeySchema = z.enum([
  "PROJECT_COST_CONTROL",
  "PROJECT_CASH_FLOW",
  "PROJECT_BUDGET_VARIANCE",
  "PROJECT_CERTIFICATIONS",
  "PROJECT_PROCUREMENT",
  "PROJECT_SUBCONTRACTS",
  "PROJECT_MATERIALS",
  "PROJECT_INCOME_EXPENSE",
  "PROJECT_PROFITABILITY",
]);

export const scheduledReportKeySchema = z.union([
  tenantScheduledReportKeySchema,
  projectScheduledReportKeySchema,
]);

export type ScheduledReportKey = z.infer<typeof scheduledReportKeySchema>;

export const scheduledReportScopeSchema = z.enum(["TENANT", "PROJECT"]);
export const scheduledReportFrequencySchema = z.enum(["DAILY", "WEEKLY", "MONTHLY"]);
export const scheduledReportFormatSchema = z.enum(["CSV", "PDF"]);

/** Browsers may send `HH:mm:ss` from `<input type="time">`; normalize to HH:mm. */
const timeOfDaySchema = z.preprocess(
  (val) => {
    if (typeof val !== "string") return val;
    const trimmed = val.trim();
    const match = trimmed.match(/^(\d{2}:\d{2})/);
    return match ? match[1] : trimmed;
  },
  z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "Hora inválida (use HH:mm)"),
);

const timezoneSchema = z.string().trim().min(1).max(64);

const paramsRecordSchema = z
  .record(z.string().max(64), z.string().max(512))
  .refine((o) => Object.keys(o).length <= 48, "Demasiados parámetros")
  .refine(
    (o) => !Object.keys(o).some((k) => /^(tenantId|companyId|projectId)$/i.test(k)),
    "Parámetros reservados no permitidos",
  )
  .optional();

const reportItemsSchema = z
  .array(
    z.object({
      reportKey: scheduledReportKeySchema,
      sortOrder: z.number().int().min(0).max(99).optional(),
    }),
  )
  .min(1, "Seleccioná al menos un reporte")
  .max(5, "Máximo 5 reportes por envío")
  .superRefine((items, ctx) => {
    const seen = new Set<string>();
    for (let i = 0; i < items.length; i++) {
      const key = items[i]!.reportKey;
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "No repetir el mismo reporte en un envío",
          path: [i, "reportKey"],
        });
      }
      seen.add(key);
    }
  });

const recipientUserIdsSchema = z
  .array(z.string().uuid())
  .min(1, "Seleccioná al menos un destinatario")
  .max(10, "Máximo 10 destinatarios");

function scopeKeyRefine(
  scope: z.infer<typeof scheduledReportScopeSchema>,
  items: { reportKey: ScheduledReportKey }[],
  ctx: z.RefinementCtx,
) {
  const prefix = scope === "TENANT" ? "TENANT_" : "PROJECT_";
  for (let i = 0; i < items.length; i++) {
    if (!items[i]!.reportKey.startsWith(prefix)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "El reporte no corresponde al alcance seleccionado",
        path: ["items", i, "reportKey"],
      });
    }
  }
}

function refineScheduleTiming(
  data: {
    frequency: z.infer<typeof scheduledReportFrequencySchema>;
    dayOfWeek?: number;
    dayOfMonth?: number;
  },
  ctx: z.RefinementCtx,
): void {
  if (data.frequency === "WEEKLY" && data.dayOfWeek == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Seleccioná el día de la semana",
      path: ["dayOfWeek"],
    });
  }
  if (data.frequency === "MONTHLY" && data.dayOfMonth == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Seleccioná el día del mes (1–28)",
      path: ["dayOfMonth"],
    });
  }
  if (data.frequency === "DAILY" && (data.dayOfWeek != null || data.dayOfMonth != null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Frecuencia diaria no usa día de semana ni de mes",
      path: ["frequency"],
    });
  }
}

const scheduledReportBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  scope: scheduledReportScopeSchema,
  projectId: z.string().uuid().optional(),
  format: scheduledReportFormatSchema,
  params: paramsRecordSchema,
  items: reportItemsSchema,
  recipientUserIds: recipientUserIdsSchema,
  frequency: scheduledReportFrequencySchema,
  dayOfWeek: z.number().int().min(1).max(7).optional(),
  dayOfMonth: z.number().int().min(1).max(28).optional(),
  timeOfDay: timeOfDaySchema,
  timezone: timezoneSchema.optional(),
});

function refineScheduledReportBody(
  data: z.infer<typeof scheduledReportBodySchema>,
  ctx: z.RefinementCtx,
): void {
  refineScheduleTiming(data, ctx);
  if (data.scope === "TENANT" && data.projectId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Alcance empresa no admite proyecto",
      path: ["projectId"],
    });
  }
  if (data.scope === "PROJECT" && !data.projectId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Seleccioná un proyecto",
      path: ["projectId"],
    });
  }
  scopeKeyRefine(data.scope, data.items, ctx);
}

export const createScheduledReportSchema = scheduledReportBodySchema.superRefine(
  refineScheduledReportBody,
);

export const updateScheduledReportSchema = scheduledReportBodySchema
  .extend({ id: z.string().uuid() })
  .superRefine((data, ctx) => refineScheduledReportBody(data, ctx));

export type CreateScheduledReportInput = z.infer<typeof createScheduledReportSchema>;
export type UpdateScheduledReportInput = z.infer<typeof updateScheduledReportSchema>;
