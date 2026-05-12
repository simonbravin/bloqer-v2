"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";

function safeCallbackUrl(raw: string | null): string {
  if (!raw) return "/dashboard";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw;
}

export function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = useMemo(
    () => safeCallbackUrl(searchParams.get("callbackUrl")),
    [searchParams],
  );

  return (
    <div className="space-y-4">
      <Button
        className="w-full"
        variant="outline"
        onClick={() => signIn("google", { callbackUrl })}
      >
        Continuar con Google
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Al ingresar aceptás los términos de uso de Bloqer.
      </p>
    </div>
  );
}
