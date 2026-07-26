"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  buildGoogleInvitationAuthParams,
  isInvitationAcceptCallbackUrl,
  isPlausibleInvitationEmail,
  normalizeInvitationEmail,
} from "@/lib/invitation-auth";
import {
  authErrorMessage,
  resolveClientPostLoginUrl,
  safeCallbackUrl,
} from "@/lib/auth-callback-url";
import { AuthAlert } from "@/features/auth/components/auth-alert";
import { GoogleIcon } from "@/features/auth/components/google-icon";
import { PasswordField } from "@/features/auth/components/password-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const searchParams = useSearchParams();
  const [pending, setPending] = useState<"google" | "credentials" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");

  const callbackUrl = useMemo(
    () => safeCallbackUrl(searchParams.get("callbackUrl")),
    [searchParams],
  );
  const invitedEmail = useMemo(() => {
    const raw = searchParams.get("invitedEmail")?.trim() ?? "";
    return isPlausibleInvitationEmail(raw) ? normalizeInvitationEmail(raw) : "";
  }, [searchParams]);
  const [email, setEmail] = useState(invitedEmail);

  const oauthError = useMemo(
    () => authErrorMessage(searchParams.get("error")),
    [searchParams],
  );

  const selectAccount = useMemo(() => {
    if (searchParams.get("selectAccount") === "1") return true;
    return isInvitationAcceptCallbackUrl(callbackUrl);
  }, [searchParams, callbackUrl]);

  const googleAuthParams = selectAccount ? buildGoogleInvitationAuthParams(invitedEmail) : undefined;
  const emailValue = invitedEmail || email;
  const shownError = error ?? oauthError;

  async function handleGoogleSignIn() {
    setPending("google");
    setError(null);
    try {
      // Auth.js v5: OAuth always navigates; do not use redirect:false (returns undefined + false error).
      await signIn("google", { callbackUrl }, googleAuthParams);
    } catch {
      setError("Error al iniciar sesión con Google. Intentá de nuevo.");
      setPending(null);
    }
  }

  async function handleCredentialsSignIn(e: React.FormEvent) {
    e.preventDefault();
    setPending("credentials");
    setError(null);
    try {
      const result = await signIn("credentials", {
        email: emailValue,
        password,
        callbackUrl,
        redirect: false,
      });

      // Auth.js may return nullish / throw on malformed absolute URL parsing — treat as failure.
      if (!result || result.error || result.ok === false) {
        setError(
          authErrorMessage(result?.error) ??
            "No pudimos iniciar sesión. Verificá email y contraseña, o confirmá tu cuenta si todavía no lo hiciste.",
        );
        setPending(null);
        return;
      }

      const nextUrl = resolveClientPostLoginUrl(result.url, callbackUrl);
      window.location.assign(nextUrl);
    } catch {
      setError("Error al iniciar sesión. Intentá de nuevo.");
      setPending(null);
    }
  }

  return (
    <div className="space-y-4">
      {invitedEmail ? (
        <AuthAlert variant="info">
          Para aceptar la invitación, iniciá sesión con{" "}
          <span className="font-medium text-foreground">{invitedEmail}</span>.
        </AuthAlert>
      ) : null}
      {shownError ? <AuthAlert variant="error">{shownError}</AuthAlert> : null}

      <form className="space-y-3" onSubmit={(e) => void handleCredentialsSignIn(e)}>
        <div className="space-y-1.5">
          <Label htmlFor="login-email">Email</Label>
          <Input
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={emailValue}
            onChange={(ev) => setEmail(ev.target.value)}
            disabled={pending !== null || Boolean(invitedEmail)}
            placeholder="nombre@empresa.com"
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="login-password">Contraseña</Label>
            <Link
              href="/recuperar-contrasena"
              className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
          <PasswordField
            id="login-password"
            name="password"
            autoComplete="current-password"
            required
            disabled={pending !== null}
            value={password}
            onChange={setPassword}
          />
        </div>
        <Button className="w-full" type="submit" disabled={pending !== null}>
          {pending === "credentials" ? "Ingresando…" : "Iniciar sesión"}
        </Button>
      </form>

      <div className="relative py-1">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase tracking-wide">
          <span className="bg-card px-2 text-muted-foreground">o</span>
        </div>
      </div>

      <Button
        className="w-full gap-2"
        variant="outline"
        type="button"
        disabled={pending !== null}
        onClick={() => void handleGoogleSignIn()}
      >
        <GoogleIcon className="h-4 w-4 shrink-0" />
        {pending === "google" ? "Abriendo Google…" : "Continuar con Google"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        ¿No tenés cuenta?{" "}
        <Link href="/registro" className="font-medium text-foreground underline-offset-4 hover:underline">
          Registrate
        </Link>
      </p>
      <p className="text-center text-xs text-muted-foreground">
        Al ingresar aceptás los términos de uso de Bloqer.
      </p>
    </div>
  );
}
