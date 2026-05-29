import { z } from "zod";

export const auditUiModuleSchema = z.enum([
  "PROCUREMENT",
  "AP",
  "AR",
  "TREASURY",
  "INVENTORY",
  "BUDGET",
  "CERTIFICATIONS",
  "SUBCONTRACTS",
  "SCHEDULE",
  "JOBSITE_LOG",
  "ACCOUNTING",
  "PROJECTS",
  "DIRECTORY",
  "CONFIGURATION",
  "DOCUMENTS",
]);

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (use YYYY-MM-DD)")
  .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime()), "Fecha inválida");

const coercedValidDateSchema = z.coerce
  .date()
  .refine((value) => !Number.isNaN(value.getTime()), "Fecha inválida");

export const listTenantAuditLogFiltersSchema = z.object({
  module: auditUiModuleSchema.optional(),
  projectId: z.string().uuid().optional(),
  companyId: z.string().uuid().optional(),
  actorUserId: z.string().uuid().optional(),
  entityType: z.string().trim().min(1).max(128).optional(),
  entityId: z.string().uuid().optional(),
  action: z.string().trim().min(1).max(128).optional(),
  dateFrom: coercedValidDateSchema.optional(),
  dateTo: coercedValidDateSchema.optional(),
  reference: z.string().trim().min(1).max(64).optional(),
  cursor: z.string().trim().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

/** Filters from URL search params (date fields as YYYY-MM-DD strings). */
export const listTenantAuditLogUrlFiltersSchema = z.object({
  module: auditUiModuleSchema.optional(),
  projectId: z.string().uuid().optional(),
  companyId: z.string().uuid().optional(),
  actorUserId: z.string().uuid().optional(),
  entityType: z.string().trim().min(1).max(128).optional(),
  entityId: z.string().uuid().optional(),
  action: z.string().trim().min(1).max(128).optional(),
  dateFrom: dateOnlySchema.optional(),
  dateTo: dateOnlySchema.optional(),
  reference: z.string().trim().min(1).max(64).optional(),
  cursor: z.string().trim().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export type ListTenantAuditLogFilters = z.infer<typeof listTenantAuditLogFiltersSchema>;

/** URL filters for CSV export (same as list, without pagination). */
export const exportTenantAuditLogUrlFiltersSchema = listTenantAuditLogUrlFiltersSchema.omit({
  cursor: true,
  limit: true,
});
