import { z } from "zod";

export const subscriptionStatusSchema = z.enum([
  "NONE",
  "TRIAL",
  "ACTIVE",
  "PAST_DUE",
  "CANCELLED",
]);

export const tenantOperationalStatusSchema = z.enum(["ACTIVE", "SUSPENDED", "INACTIVE"]);

export const updatePlatformTenantStatusInputSchema = z.object({
  tenantId: z.string().uuid(),
  status: tenantOperationalStatusSchema,
  suspendedReason: z.string().max(512).nullable().optional(),
});

export const updatePlatformTenantPlanMetadataInputSchema = z.object({
  tenantId: z.string().uuid(),
  saasPlan: z.string().trim().min(1).max(64).optional(),
  subscriptionStatus: subscriptionStatusSchema.optional(),
  trialEndsAt: z.union([z.null(), z.coerce.date()]).optional(),
  billingCustomerId: z.union([z.null(), z.string().max(255)]).optional(),
  platformInternalNotes: z.union([z.null(), z.string().max(8000)]).optional(),
});

/** Extends `trialEndsAt` by N days from max(now, current trial end). */
export const extendPlatformTenantTrialInputSchema = z.object({
  tenantId: z.string().uuid(),
  additionalDays: z.coerce.number().int().min(1).max(90),
});

export const listPlatformAuditLogFiltersSchema = z.object({
  targetTenantId: z.string().uuid().optional(),
  action: z.string().trim().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export type UpdatePlatformTenantStatusInput = z.infer<typeof updatePlatformTenantStatusInputSchema>;
export type UpdatePlatformTenantPlanMetadataInput = z.infer<typeof updatePlatformTenantPlanMetadataInputSchema>;
export type ExtendPlatformTenantTrialInput = z.infer<typeof extendPlatformTenantTrialInputSchema>;
export type ListPlatformAuditLogFilters = z.infer<typeof listPlatformAuditLogFiltersSchema>;
