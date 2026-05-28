import { z } from "zod";
import { completeTrialOnboardingInputSchema } from "./onboarding";
import { userRoleEnum } from "./tenant-invitations";

export const provisionPlatformTenantInputSchema = completeTrialOnboardingInputSchema.extend({
  ownerEmail: z.string().trim().toLowerCase().pipe(z.string().email()),
  ownerRoles: z.array(userRoleEnum).min(1).max(16).default(["OWNER"]),
  invitationExpiresInDays: z.coerce.number().int().min(1).max(30).default(7),
});

export type ProvisionPlatformTenantInput = z.infer<typeof provisionPlatformTenantInputSchema>;
