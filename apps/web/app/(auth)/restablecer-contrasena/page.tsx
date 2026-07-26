import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";
import { AuthCard } from "@/features/auth/components/auth-card";

export const metadata = {
  title: "Restablecer contraseña — Bloqer",
};

type PageProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function ResetPasswordPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token.trim() : "";

  return (
    <AuthCard title="Nueva contraseña" description="Elegí una contraseña segura para tu cuenta de Bloqer.">
      <ResetPasswordForm token={token} />
    </AuthCard>
  );
}
