import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LoginForm } from "@/features/auth/components/login-form";
import { AuthCard } from "@/features/auth/components/auth-card";
import { AuthAlert } from "@/features/auth/components/auth-alert";
import { getSession } from "@/lib/auth";
import { safeCallbackUrl } from "@/lib/auth-callback-url";

type PageProps = {
  searchParams: Promise<{ emailConfirmado?: string; callbackUrl?: string }>;
};

export default async function LoginPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const emailConfirmado = params.emailConfirmado === "1";
  const callbackUrl = safeCallbackUrl(params.callbackUrl);

  const session = await getSession();
  if (session?.user?.id) {
    redirect(callbackUrl);
  }

  return (
    <AuthCard
      title="Iniciar sesión"
      description="Entrá con email y contraseña, o con tu cuenta de Google."
      logoHref={null}
    >
      {emailConfirmado ? (
        <AuthAlert variant="success">Email confirmado. Ya podés iniciar sesión.</AuthAlert>
      ) : null}
      <Suspense fallback={<div className="h-40 w-full animate-pulse rounded-md bg-muted" />}>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
