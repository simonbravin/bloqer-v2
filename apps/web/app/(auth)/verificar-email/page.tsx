import Link from "next/link";
import { AuthCard } from "@/features/auth/components/auth-card";
import { AuthAlert } from "@/features/auth/components/auth-alert";
import { Button } from "@/components/ui/button";
import { verifyEmailFormAction } from "@/app/(auth)/actions";

export const metadata = {
  title: "Verificar email — Bloqer",
};

type PageProps = {
  searchParams: Promise<{ token?: string; error?: string }>;
};

export default async function VerifyEmailPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token.trim() : "";
  const error = typeof params.error === "string" ? params.error : "";

  if (error === "invalid" || error === "missing") {
    return (
      <AuthCard title="Verificar email" description="Confirmación de cuenta Bloqer">
        <AuthAlert variant="error">
          {error === "missing"
            ? "Falta el token del enlace."
            : "El enlace no es válido o ya expiró. Pedí un reenvío desde el registro o recuperá tu contraseña."}
        </AuthAlert>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="outline" className="w-full">
            <Link href="/registro">Ir al registro</Link>
          </Button>
          <Button asChild className="w-full">
            <Link href="/login">Iniciar sesión</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  if (!token) {
    return (
      <AuthCard title="Verificar email" description="Confirmación de cuenta Bloqer">
        <AuthAlert variant="error">Falta el token del enlace. Abrí el link desde tu correo.</AuthAlert>
        <Button asChild className="w-full">
          <Link href="/login">Ir a iniciar sesión</Link>
        </Button>
      </AuthCard>
    );
  }

  // GET only shows confirmation UI — consume token on POST to avoid email-client prefetch burning the link.
  return (
    <AuthCard
      title="Verificar email"
      description="Confirmá que este correo es tuyo para activar tu cuenta."
    >
      <AuthAlert variant="info">
        Por seguridad, la cuenta se activa solo cuando confirmás con el botón de abajo.
      </AuthAlert>
      <form action={verifyEmailFormAction} className="space-y-3">
        <input type="hidden" name="token" value={token} />
        <Button type="submit" className="w-full">
          Confirmar mi email
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
          Volver al inicio de sesión
        </Link>
      </p>
    </AuthCard>
  );
}
