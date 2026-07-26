import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .email("Email inválido")
  .max(320)
  .transform((e) => e.toLowerCase());

/** bcrypt truncates at 72 bytes; enforce max length in validation. */
export const passwordSchema = z
  .string()
  .min(10, "La contraseña debe tener al menos 10 caracteres")
  .max(72, "La contraseña no puede superar 72 caracteres")
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), {
    message: "La contraseña debe incluir al menos una letra y un número",
  });

export const registerWithEmailPasswordSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirmá tu contraseña"),
    name: z
      .string()
      .trim()
      .max(120)
      .optional()
      .transform((v) => (v === "" || v === undefined ? undefined : v)),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

export type RegisterWithEmailPasswordInput = z.infer<typeof registerWithEmailPasswordSchema>;

export const loginWithEmailPasswordSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Ingresá tu contraseña").max(72),
});

export type LoginWithEmailPasswordInput = z.infer<typeof loginWithEmailPasswordSchema>;

export const resendVerificationEmailSchema = z.object({
  email: emailSchema,
});

export type ResendVerificationEmailInput = z.infer<typeof resendVerificationEmailSchema>;

export const verifyEmailTokenSchema = z.object({
  token: z.string().trim().min(20).max(200),
});

export type VerifyEmailTokenInput = z.infer<typeof verifyEmailTokenSchema>;

export const requestPasswordResetSchema = z.object({
  email: emailSchema,
});

export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;

export const resetPasswordWithTokenSchema = z
  .object({
    token: z.string().trim().min(20).max(200),
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirmá tu contraseña"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

export type ResetPasswordWithTokenInput = z.infer<typeof resetPasswordWithTokenSchema>;
