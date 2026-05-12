import { z } from "zod";

export const updatePlatformTenantModuleInputSchema = z.object({
  tenantId: z.string().uuid(),
  moduleKey: z.string().min(1).max(64),
  isEnabled: z.boolean(),
  internalNotes: z.union([z.null(), z.string().max(2000)]).optional(),
});

export type UpdatePlatformTenantModuleInput = z.infer<typeof updatePlatformTenantModuleInputSchema>;
