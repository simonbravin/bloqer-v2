"use server";

import { redirect } from "next/navigation";
import {
  registerWithEmailPassword,
  requestPasswordReset,
  resendVerificationEmail,
  resetPasswordWithToken,
  verifyEmailWithToken,
} from "@bloqer/services";

export type AuthActionState = {
  ok: boolean;
  message: string | null;
  error: string | null;
  flashLink: string | null;
  email: string | null;
};

const emptyState = (): AuthActionState => ({
  ok: false,
  message: null,
  error: null,
  flashLink: null,
  email: null,
});

export async function registerAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const result = await registerWithEmailPassword({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
    name: String(formData.get("name") ?? "") || undefined,
  });

  if (!result.ok) {
    return { ...emptyState(), error: result.error };
  }

  return {
    ok: true,
    message: result.message,
    error: null,
    flashLink: result.dispatch.flashLink,
    email: result.email,
  };
}

export async function resendVerificationAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const result = await resendVerificationEmail({
    email: String(formData.get("email") ?? ""),
  });
  return {
    ok: true,
    message: result.message,
    error: null,
    flashLink: result.dispatch.flashLink,
    email: result.email || null,
  };
}

export async function requestPasswordResetAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const result = await requestPasswordReset({
    email: String(formData.get("email") ?? ""),
  });
  return {
    ok: true,
    message: result.message,
    error: null,
    flashLink: result.dispatch.flashLink,
    email: null,
  };
}

export async function resetPasswordAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const result = await resetPasswordWithToken({
    token: String(formData.get("token") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  });
  if (!result.ok) {
    return { ...emptyState(), error: result.error };
  }
  return {
    ok: true,
    message: "Contraseña actualizada. Ya podés iniciar sesión.",
    error: null,
    flashLink: null,
    email: null,
  };
}

export async function verifyEmailFormAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) {
    redirect("/verificar-email?error=missing");
  }
  const result = await verifyEmailWithToken({ token });
  if (!result.ok) {
    redirect("/verificar-email?error=invalid");
  }
  redirect("/login?emailConfirmado=1");
}
