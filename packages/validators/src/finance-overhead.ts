import { z } from "zod";

export const createProjectOverheadAllocationSchema = z.object({
  projectId: z.string().uuid(),
  companyId: z.string().uuid(),
  period: z.string().regex(/^\d{4}-\d{2}$/, "Período inválido (use YYYY-MM)"),
  amount: z
    .string()
    .min(1, "Ingresá un monto")
    .refine((v) => !Number.isNaN(parseFloat(v)) && parseFloat(v) > 0, "El monto debe ser mayor a cero"),
  currency: z.string().min(3).max(8).default("ARS"),
  notes: z.string().max(2000).nullable().optional(),
});

export type CreateProjectOverheadAllocationInput = z.infer<typeof createProjectOverheadAllocationSchema>;

export const updateCompanyOverheadPctSchema = z.object({
  companyId: z.string().uuid(),
  overheadAllocationPct: z.number().min(0).max(100),
});

export type UpdateCompanyOverheadPctInput = z.infer<typeof updateCompanyOverheadPctSchema>;

export const overheadAllocationModeSchema = z.enum(["MANUAL", "AUTO_WEIGHT"]);

export const updateCompanyOverheadModeSchema = z.object({
  companyId: z.string().uuid(),
  overheadAllocationMode: overheadAllocationModeSchema,
});

export type UpdateCompanyOverheadModeInput = z.infer<typeof updateCompanyOverheadModeSchema>;

export const autoWeightPreviewQuerySchema = z.object({
  companyId: z.string().uuid(),
  period: z.string().regex(/^\d{4}-\d{2}$/, "Período inválido (use YYYY-MM)"),
});

export type AutoWeightPreviewQueryInput = z.infer<typeof autoWeightPreviewQuerySchema>;
