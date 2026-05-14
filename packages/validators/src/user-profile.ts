import { z } from "zod";

/** Self-service profile: display name only (email is account identity, not editable here). */
export const updateMyUserProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Ingresá un nombre")
    .max(120, "El nombre no puede superar 120 caracteres"),
});

export type UpdateMyUserProfileInput = z.infer<typeof updateMyUserProfileSchema>;
