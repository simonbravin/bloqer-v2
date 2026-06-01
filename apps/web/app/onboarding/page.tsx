import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listPendingInvitationsForEmail } from "@bloqer/services";
import { OnboardingForm } from "./onboarding-form";
import { PendingOrganizationInvitations } from "./pending-organization-invitations";

export const metadata = {
  title: "Crear espacio de trabajo — Bloqer",
};

export default async function OnboardingPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  if (current.tenantCtx) redirect("/dashboard");

  const userEmail = current.session.user?.email?.trim() ?? "";
  const pendingInvitations = userEmail ? await listPendingInvitationsForEmail(userEmail) : [];
  const hasPendingInvitations = pendingInvitations.length > 0;
  const missingEmail = !userEmail;

  return (
    <div className="w-full max-w-xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {hasPendingInvitations
            ? "Unite a tu organización"
            : missingEmail
              ? "Cuenta sin email"
              : "Crear tu espacio de trabajo"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {hasPendingInvitations
            ? "Tu equipo ya tiene un espacio en Bloqer. Aceptá la invitación para compartir el mismo plan de prueba."
            : missingEmail
              ? "Tu sesión de Google no expone un email válido. Cerrá sesión e ingresá con la cuenta que recibió la invitación."
              : "Completá los datos de tu empresa para activar la prueba gratuita de 30 días de tu organización. No se requiere tarjeta en esta etapa."}
        </p>
      </div>

      {hasPendingInvitations ? (
        <PendingOrganizationInvitations invitations={pendingInvitations} userEmail={userEmail} />
      ) : missingEmail ? null : (
        <OnboardingForm userEmail={userEmail} />
      )}
    </div>
  );
}
