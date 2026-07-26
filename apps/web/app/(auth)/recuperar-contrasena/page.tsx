import { RecoverPasswordForm } from "@/features/auth/components/recover-password-form";
import { AuthCard } from "@/features/auth/components/auth-card";

export const metadata = {
  title: "Recuperar contraseña — Bloqer",
};

export default function RecoverPasswordPage() {
  return (
    <AuthCard
      title="Recuperar contraseña"
      description="Te enviamos un enlace para elegir una contraseña nueva. También sirve si hoy entrás solo con Google."
    >
      <RecoverPasswordForm />
    </AuthCard>
  );
}
