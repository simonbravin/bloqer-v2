"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  buildGoogleInvitationAuthParams,
  isInvitationAcceptCallbackUrl,
  isPlausibleInvitationEmail,
  normalizeInvitationEmail,
} from "@/lib/invitation-auth";
import { Button } from "@/components/ui/button";

function safeCallbackUrl(raw: string | null): string {
  if (!raw) return "/dashboard";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw;
}

export function LoginForm() {
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const callbackUrl = useMemo(
    () => safeCallbackUrl(searchParams.get("callbackUrl")),
    [searchParams],
  );
  const invitedEmail = useMemo(() => {
    const raw = searchParams.get("invitedEmail")?.trim() ?? "";
    return isPlausibleInvitationEmail(raw) ? normalizeInvitationEmail(raw) : "";
  }, [searchParams]);
  const selectAccount = useMemo(() => {
    if (searchParams.get("selectAccount") === "1") return true;
    return isInvitationAcceptCallbackUrl(callbackUrl);
  }, [searchParams, callbackUrl]);

  const googleAuthParams = selectAccount ? buildGoogleInvitationAuthParams(invitedEmail) : undefined;

  async function handleGoogleSignIn() {
    setPending(true);
    setError(null);
    try {
      const result = await signIn("google", { callbackUrl, redirect: false }, googleAuthParams);
      if (result?.url) {
        window.location.assign(result.url);
        return;
      }
      if (result?.error) {
        setError("No se pudo abrir Google. Intentá de nuevo.");
        setPending(false);
        return;
      }
      setError("No se pudo iniciar sesión con Google.");
      setPending(false);
    } catch {
      setError("Error al iniciar sesión. Intentá de nuevo.");
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      {invitedEmail ? (
        <p className="text-sm text-muted-foreground">
          Para aceptar la invitación, iniciá sesión con{" "}
          <span className="font-medium text-foreground">{invitedEmail}</span>.
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button
        className="w-full"
        variant="outline"
        disabled={pending}
        onClick={() => void handleGoogleSignIn()}
      >
        {pending
          ? "Abriendo Google…"
          : invitedEmail
            ? `Continuar con Google — ${invitedEmail}`
            : "Continuar con Google"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Al ingresar aceptás los términos de uso de Bloqer.
      </p>
    </div>
  );
}
