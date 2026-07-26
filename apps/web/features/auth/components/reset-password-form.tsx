"use client";

import Link from "next/link";
import { useActionState } from "react";
import { resetPasswordAction, type AuthActionState } from "@/app/(auth)/actions";
import { AuthAlert } from "@/features/auth/components/auth-alert";
import { PasswordField } from "@/features/auth/components/password-field";
import { Button } from "@/components/ui/button";

const initial: AuthActionState = {
  ok: false,
  message: null,
  error: null,
  flashLink: null,
  email: null,
};

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, initial);

  if (!token) {
    return (
      <div className="space-y-3">
        <AuthAlert variant="error">
          Falta el token del enlace. Pedí un nuevo correo de recuperación.
        </AuthAlert>
        <Button asChild variant="outline" className="w-full">
          <Link href="/recuperar-contrasena">Recuperar contraseña</Link>
        </Button>
      </div>
    );
  }

  if (state.ok && state.message) {
    return (
      <div className="space-y-3">
        <AuthAlert variant="success">{state.message}</AuthAlert>
        <Button asChild className="w-full">
          <Link href="/login">Ir a iniciar sesión</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {state.error ? <AuthAlert variant="error">{state.error}</AuthAlert> : null}
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="token" value={token} />
        <PasswordField
          id="reset-password"
          name="password"
          label="Nueva contraseña"
          autoComplete="new-password"
          required
          disabled={pending}
          hint="Mínimo 10 caracteres, con al menos una letra y un número."
        />
        <PasswordField
          id="reset-confirm-password"
          name="confirmPassword"
          label="Confirmar contraseña"
          autoComplete="new-password"
          required
          disabled={pending}
        />
        <Button className="w-full" type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar contraseña"}
        </Button>
      </form>
    </div>
  );
}
