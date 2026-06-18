import { formatDateTime } from "@/lib/format";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  TENANT_INVITE_LINK_FLASH_COOKIE,
  TENANT_INVITE_EMAIL_FLASH_COOKIE,
} from "@/lib/tenant-invitation-flash";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import {
  canEditTeamMembership,
  canReadTenantConfigArea,
  getTenantInvitationById,
  ServiceError,
} from "@bloqer/services";
import { cancelTenantInvitationAction } from "../../invitation-actions";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";

interface PageProps {
  params: Promise<{ invitationId: string }>;
}

function invitationStatusLabel(s: string) {
  switch (s) {
    case "PENDING":
      return "Pendiente";
    case "ACCEPTED":
      return "Aceptada";
    case "CANCELLED":
      return "Cancelada";
    case "EXPIRED":
      return "Vencida";
    default:
      return s;
  }
}

export default async function ConfiguracionEquipoInvitacionDetallePage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!canReadTenantConfigArea(current.tenantCtx.roles)) notFound();

  const { invitationId } = await params;
  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");

  let inv;
  try {
    inv = await getTenantInvitationById(invitationId, ctx);
  } catch (e) {
    if (e instanceof ServiceError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  }

  const c = await cookies();
  const flashLink = c.get(TENANT_INVITE_LINK_FLASH_COOKIE)?.value ?? null;
  const flashEmailNote = c.get(TENANT_INVITE_EMAIL_FLASH_COOKIE)?.value ?? null;

  const canEdit = canEditTeamMembership(current.tenantCtx.roles);

  return (
    <PageShell variant="form" className="space-y-6" breadcrumbLabel={inv.email}>
      <div className="flex flex-wrap gap-2">
      </div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Invitación</h1>
        <p className="text-sm text-muted-foreground">{inv.email}</p>
      </div>

      {flashLink ? (
        <section className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 dark:bg-amber-500/10">
          <h2 className="text-sm font-semibold">Enlace de invitación (copiá y compartí)</h2>
          <p className="text-xs text-muted-foreground">
            {flashEmailNote ??
              "El correo no se despachó (integración desactivada, URL pública de la app ausente o inválida, o fallo del proveedor). Este enlace incluye un token secreto: no lo publiques en lugares públicos."}
          </p>
          <p className="break-all font-mono text-xs">{flashLink}</p>
        </section>
      ) : null}

      <dl className="grid gap-2 text-sm">
        <div>
          <dt className="text-muted-foreground">Estado</dt>
          <dd>{invitationStatusLabel(inv.status)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Roles</dt>
          <dd className="text-xs">{inv.roles.join(", ")}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Invitó</dt>
          <dd>{inv.invitedByEmail}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Vence</dt>
          <dd>{formatDateTime(inv.expiresAt)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Creada</dt>
          <dd>{formatDateTime(inv.createdAt)}</dd>
        </div>
      </dl>

      {canEdit && inv.status === "PENDING" ? (
        <form action={cancelTenantInvitationAction} className="rounded-lg border bg-card p-4">
          <input type="hidden" name="invitationId" value={inv.id} />
          <Button type="submit" variant="destructive" size="sm">
            Cancelar invitación
          </Button>
        </form>
      ) : null}
    </PageShell>
  );
}
