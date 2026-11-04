import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getMembershipByUserId, listPendingInvitationsForEmail } from "@bloqer/services";
import { OnboardingForm } from "./onboarding-form";
import { PendingOrganizationInvitations } from "./pending-organization-invitations";
import { signOutOnboardingAction } from "./actions";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Crear espacio de trabajo — Bloqer",
};

export default async function OnboardingPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  if (current.tenantCtx) redirect("/dashboard");

  const existingMembership = await getMembershipByUserId(current.session.user.id);
  const userEmail = current.session.user?.email?.trim() ?? "";
  const pendingInvitations = userEmail ? await listPendingInvitationsForEmail(userEmail) : [];
  if (existingMembership) {
    return (
      <div className="w-full max-w-xl space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Acceso al espacio no disponible</h1>
        <p role="alert" className="text-sm text-muted-foreground">
          Tu cuenta ya pertenece a una organización, pero el espacio, la empresa asignada o tus roles requieren una revisión.
          Pedile a un administrador que revise tu acceso.
        </p>
        {pendingInvitations.length > 0 ? (
          <PendingOrganizationInvitations invitations={pendingInvitations} userEmail={userEmail} />
        ) : null}
        <form action={signOutOnboardingAction}>
          <Button type="submit" variant="outline">Cerrar sesión</Button>
        </form>
      </div>
    );
  }

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
