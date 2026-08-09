import { z } from "zod";

export const userRoleEnum = z.enum([
  "OWNER",
  "ADMIN",
  "FINANCE",
  "TREASURER",
  "PROJECT_FINANCE",
  "PROCUREMENT",
  "WAREHOUSE",
  "SALES",
  "VIEWER",
  "PROJECT_MANAGER",
  "SITE_FOREMAN",
  "PROJECT_VIEWER",
]);

export const createTenantInvitationSchema = z.object({
  email:           z.string().trim().toLowerCase().pipe(z.string().email()),
  roles:           z.array(userRoleEnum).min(1).max(16),
  companyId:       z.union([z.string().uuid(), z.literal(""), z.null()]).optional(),
  expiresInDays:   z.coerce.number().int().min(1).max(30).default(7),
});

export const cancelTenantInvitationSchema = z.object({
  invitationId: z.string().uuid(),
});

/** Raw invite tokens are 32 random bytes hex-encoded (64 chars). */
export const acceptTenantInvitationSchema = z.object({
  token: z
    .string()
    .regex(/^[a-f0-9]{64}$/i, "Token inválido"),
});

export type CreateTenantInvitationInput = z.infer<typeof createTenantInvitationSchema>;
export type CancelTenantInvitationInput = z.infer<typeof cancelTenantInvitationSchema>;
export type AcceptTenantInvitationInput = z.infer<typeof acceptTenantInvitationSchema>;
