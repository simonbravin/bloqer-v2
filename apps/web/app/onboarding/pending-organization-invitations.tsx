import { formatDateTime } from "@/lib/format";
import type { PendingInvitationSummary } from "@bloqer/services";

type PendingOrganizationInvitationsProps = {
  invitations: PendingInvitationSummary[];
  userEmail: string;
};

export function PendingOrganizationInvitations({
  invitations,
  userEmail,
}: PendingOrganizationInvitationsProps) {
  return (
    <div className="space-y-4 rounded-xl border border-amber-500/40 bg-amber-500/5 p-6 dark:bg-amber-500/10">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Tenés invitaciones pendientes</h2>
        <p className="text-sm text-muted-foreground">
          Te invitaron a unirte a una organización con la cuenta{" "}
          <span className="font-medium text-foreground">{userEmail}</span>. El plan de prueba y la
          suscripción son de la <span className="font-medium text-foreground">organización</span>,
          no hace falta crear otro espacio de trabajo.
        </p>
        <p className="text-sm text-muted-foreground">
          Abrí el enlace del correo de invitación para aceptar. Si no lo encontrás, pedile al
          administrador que te lo reenvíe.
        </p>
      </div>
      <ul className="space-y-3 text-sm">
        {invitations.map((inv) => (
          <li
            key={inv.invitationId}
            className="rounded-lg border bg-card px-4 py-3"
          >
            <p className="font-medium">{inv.tenantName}</p>
            <p className="text-muted-foreground">Roles: {inv.roles.join(", ")}</p>
            <p className="text-xs text-muted-foreground">
              Enlace válido hasta {formatDateTime(inv.expiresAt)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
