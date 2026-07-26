import { RegisterForm } from "@/features/auth/components/register-form";
import { AuthCard } from "@/features/auth/components/auth-card";

export const metadata = {
  title: "Crear cuenta — Bloqer",
};

export default function RegisterPage() {
  return (
    <AuthCard
      title="Crear cuenta"
      description="Registrate con email y contraseña. Te enviamos un enlace para confirmar tu cuenta."
    >
      <RegisterForm />
    </AuthCard>
  );
}
