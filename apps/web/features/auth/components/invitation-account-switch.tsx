"use client";

import { useState } from "react";
import { signIn, signOut } from "next-auth/react";
import { buildGoogleInvitationAuthParams } from "@/lib/invitation-auth";
import { Button } from "@/components/ui/button";

type InvitationAccountSwitchProps = {
  invitedEmail: string;
  currentEmail: string;
  callbackUrl: string;
};

export function InvitationAccountSwitch({
  invitedEmail,
  currentEmail,
  callbackUrl,
}: InvitationAccountSwitchProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function switchToInvitedAccount() {
    setPending(true);
    setError(null);
    try {
      await signOut({ redirect: false });
      const result = await signIn(
        "google",
        { callbackUrl, redirect: false },
        buildGoogleInvitationAuthParams(invitedEmail),
      );
      if (result?.error) {
        setError("No se pudo abrir Google. Intentá de nuevo.");
        setPending(false);
        return;
      }
      if (result?.url) {
        window.location.assign(result.url);
        return;
      }
      setError("No se pudo iniciar sesión con Google.");
      setPending(false);
    } catch {
      setError("Error al cambiar de cuenta. Intentá de nuevo.");
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Estás conectado como{" "}
        <span className="font-medium text-foreground">{currentEmail}</span>, pero esta invitación es
        para{" "}
        <span className="font-medium text-foreground">{invitedEmail}</span>.
      </p>
      <p className="text-sm text-muted-foreground">
        Cambiá de cuenta de Google para continuar. Si tenés varias cuentas, elegí la que
        corresponde al mail invitado.
      </p>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        className="w-full"
        disabled={pending}
        onClick={() => void switchToInvitedAccount()}
      >
        {pending ? "Abriendo Google…" : `Continuar con Google — ${invitedEmail}`}
      </Button>
    </div>
  );
}
