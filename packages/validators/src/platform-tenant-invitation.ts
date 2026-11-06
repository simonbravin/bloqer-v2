import { z } from "zod";
import { createTenantInvitationSchema } from "./tenant-invitations";

export const platformTenantIdParamSchema = z.object({
  tenantId: z.string().guid(),
});

export const platformTenantInvitationIdParamSchema = z.object({
  tenantId:     z.string().guid(),
  invitationId: z.string().guid(),
});

export const createPlatformTenantInvitationInputSchema = createTenantInvitationSchema.extend({
  tenantId: z.string().guid(),
});

export type CreatePlatformTenantInvitationInput = z.infer<typeof createPlatformTenantInvitationInputSchema>;
