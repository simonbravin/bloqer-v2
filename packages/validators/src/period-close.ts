import { z } from "zod";

const periodKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Período inválido (use YYYY-MM)");

export const closePeriodSchema = z.object({
  companyId: z.string().uuid(),
  periodKey: periodKeySchema,
});

export type ClosePeriodInput = z.infer<typeof closePeriodSchema>;

export const reopenPeriodSchema = z.object({
  companyId: z.string().uuid(),
  periodKey: periodKeySchema,
  reason: z
    .string()
    .trim()
    .min(3, "Indicá un motivo de reapertura (mín. 3 caracteres)")
    .max(1024),
});

export type ReopenPeriodInput = z.infer<typeof reopenPeriodSchema>;

export const listPeriodsQuerySchema = z.object({
  companyId: z.string().uuid(),
  limit: z.number().int().min(1).max(36).optional(),
});

export type ListPeriodsQueryInput = z.infer<typeof listPeriodsQuerySchema>;
