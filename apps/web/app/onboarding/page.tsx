import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { OnboardingForm } from "./onboarding-form";

export const metadata = {
  title: "Crear espacio de trabajo — Bloqer",
};

export default async function OnboardingPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  if (current.tenantCtx) redirect("/dashboard");

  return (
    <div className="w-full max-w-xl space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">Crear tu espacio de trabajo</h1>
      <p className="text-sm text-muted-foreground">
        Completá los datos de tu empresa para activar la prueba gratuita de 30 días. No se requiere tarjeta en esta etapa.
      </p>
      <OnboardingForm userEmail={current.session.user?.email ?? ""} />
    </div>
  );
}
