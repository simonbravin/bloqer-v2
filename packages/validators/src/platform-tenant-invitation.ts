import { z } from "zod";
import { createTenantInvitationSchema } from "./tenant-invitations";

export const platformTenantIdParamSchema = z.object({
  tenantId: z.string().uuid(),
});

export const platformTenantInvitationIdParamSchema = z.object({
  tenantId:     z.string().uuid(),
  invitationId: z.string().uuid(),
});

export const createPlatformTenantInvitationInputSchema = createTenantInvitationSchema.extend({
  tenantId: z.string().uuid(),
});

export type CreatePlatformTenantInvitationInput = z.infer<typeof createPlatformTenantInvitationInputSchema>;
