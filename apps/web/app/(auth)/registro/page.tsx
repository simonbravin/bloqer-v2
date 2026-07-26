import { redirect } from "next/navigation";
import { RegisterForm } from "@/features/auth/components/register-form";
import { AuthCard } from "@/features/auth/components/auth-card";
import { getSession } from "@/lib/auth";

export const metadata = {
  title: "Crear cuenta — Bloqer",
};

export default async function RegisterPage() {
  const session = await getSession();
  if (session?.user?.id) {
    redirect("/dashboard");
  }

  return (
    <AuthCard
      title="Crear cuenta"
      description="Registrate con email y contraseña. Te enviamos un enlace para confirmar tu cuenta."
    >
      <RegisterForm />
    </AuthCard>
  );
}
