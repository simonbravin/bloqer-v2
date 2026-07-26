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
import { AuthAlert } from "@/features/auth/components/auth-alert";
import { GoogleIcon } from "@/features/auth/components/google-icon";
import { PasswordField } from "@/features/auth/components/password-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function safeCallbackUrl(raw: string | null): string {
  if (!raw) return "/dashboard";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw;
}

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

  const selectAccount = useMemo(() => {
    if (searchParams.get("selectAccount") === "1") return true;
    return isInvitationAcceptCallbackUrl(callbackUrl);
  }, [searchParams, callbackUrl]);

  const googleAuthParams = selectAccount ? buildGoogleInvitationAuthParams(invitedEmail) : undefined;
  const emailValue = invitedEmail || email;

  async function handleGoogleSignIn() {
    setPending("google");
    setError(null);
    try {
      const result = await signIn("google", { callbackUrl, redirect: false }, googleAuthParams);
      if (result?.url) {
        window.location.assign(result.url);
        return;
      }
      if (result?.error) {
        setError("No se pudo abrir Google. Intentá de nuevo.");
        setPending(null);
        return;
      }
      setError("No se pudo iniciar sesión con Google.");
      setPending(null);
    } catch {
      setError("Error al iniciar sesión. Intentá de nuevo.");
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
      if (result?.error) {
        setError(
          "No pudimos iniciar sesión. Verificá email y contraseña, o confirmá tu cuenta si todavía no lo hiciste.",
        );
        setPending(null);
        return;
      }
      if (result?.url) {
        window.location.assign(result.url);
        return;
      }
      window.location.assign(callbackUrl);
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
      {error ? <AuthAlert variant="error">{error}</AuthAlert> : null}

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
        {pending === "google"
          ? "Abriendo Google…"
          : invitedEmail
            ? "Continuar con Google"
            : "Continuar con Google"}
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
