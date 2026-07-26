"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  registerAction,
  resendVerificationAction,
  type AuthActionState,
} from "@/app/(auth)/actions";
import { AuthAlert } from "@/features/auth/components/auth-alert";
import { PasswordField } from "@/features/auth/components/password-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: AuthActionState = {
  ok: false,
  message: null,
  error: null,
  flashLink: null,
  email: null,
};

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerAction, initial);
  const [resendState, resendAction, resendPending] = useActionState(
    resendVerificationAction,
    initial,
  );

  const successEmail = resendState.email ?? state.email;
  const successMessage = resendState.ok ? resendState.message : state.message;
  const shownFlash = resendState.flashLink ?? state.flashLink;

  return (
    <div className="space-y-4">
      {state.error ? <AuthAlert variant="error">{state.error}</AuthAlert> : null}

      {state.ok ? (
        <div className="space-y-3">
          <AuthAlert variant="success">
            <p className="font-medium text-foreground dark:text-emerald-200">Revisá tu correo</p>
            <p className="mt-1">{successMessage}</p>
            {successEmail ? (
              <p className="mt-2 text-xs">
                Enviado a <span className="font-medium text-foreground">{successEmail}</span>
              </p>
            ) : null}
          </AuthAlert>
          {shownFlash ? (
            <AuthAlert variant="info">
              <p className="mb-1 text-xs font-medium text-foreground">Enlace de desarrollo</p>
              <p className="break-all font-mono text-xs">{shownFlash}</p>
            </AuthAlert>
          ) : null}
          {successEmail ? (
            <form action={resendAction} className="space-y-2">
              <input type="hidden" name="email" value={successEmail} />
              <Button
                type="submit"
                variant="outline"
                className="w-full"
                disabled={resendPending || pending}
              >
                {resendPending ? "Reenviando…" : "Reenviar email de confirmación"}
              </Button>
            </form>
          ) : null}
          <p className="text-center text-sm text-muted-foreground">
            ¿Ya confirmaste?{" "}
            <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
              Iniciá sesión
            </Link>
          </p>
        </div>
      ) : (
        <form action={formAction} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="register-name">Nombre (opcional)</Label>
            <Input
              id="register-name"
              name="name"
              autoComplete="name"
              disabled={pending}
              placeholder="Tu nombre"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="register-email">Email</Label>
            <Input
              id="register-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              disabled={pending}
              placeholder="nombre@empresa.com"
            />
          </div>
          <PasswordField
            id="register-password"
            name="password"
            label="Contraseña"
            autoComplete="new-password"
            required
            disabled={pending}
            hint="Mínimo 10 caracteres, con al menos una letra y un número."
          />
          <PasswordField
            id="register-confirm-password"
            name="confirmPassword"
            label="Confirmar contraseña"
            autoComplete="new-password"
            required
            disabled={pending}
          />
          <Button className="w-full" type="submit" disabled={pending}>
            {pending ? "Creando cuenta…" : "Crear cuenta"}
          </Button>
        </form>
      )}

      {!state.ok ? (
        <p className="text-center text-sm text-muted-foreground">
          ¿Ya tenés cuenta?{" "}
          <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
            Iniciá sesión
          </Link>
        </p>
      ) : null}
    </div>
  );
}
