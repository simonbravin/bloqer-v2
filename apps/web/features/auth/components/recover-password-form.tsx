"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordResetAction, type AuthActionState } from "@/app/(auth)/actions";
import { AuthAlert } from "@/features/auth/components/auth-alert";
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

export function RecoverPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, initial);

  return (
    <div className="space-y-4">
      {state.message ? (
        <div className="space-y-3">
          <AuthAlert variant="success">{state.message}</AuthAlert>
          {state.flashLink ? (
            <AuthAlert variant="info">
              <p className="mb-1 text-xs font-medium text-foreground">Enlace de desarrollo</p>
              <p className="break-all font-mono text-xs">{state.flashLink}</p>
            </AuthAlert>
          ) : null}
        </div>
      ) : null}

      <form action={formAction} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="recover-email">Email</Label>
          <Input
            id="recover-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            disabled={pending}
            placeholder="nombre@empresa.com"
          />
        </div>
        <Button className="w-full" type="submit" disabled={pending}>
          {pending ? "Enviando…" : "Enviar enlace"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
          Volver al inicio de sesión
        </Link>
      </p>
    </div>
  );
}
