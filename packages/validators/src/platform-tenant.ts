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

export type UpdatePlatformTenantStatusInput = z.infer<typeof updatePlatformTenantStatusInputSchema>;
export type UpdatePlatformTenantPlanMetadataInput = z.infer<typeof updatePlatformTenantPlanMetadataInputSchema>;
