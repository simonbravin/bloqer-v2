import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@bloqer/auth";
import { getPlatformTenantInvitationById, ServiceError } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { getPlatformServiceContext } from "@/lib/platform-service-context";
import { formatDateTime } from "@/lib/format";
import {
  PLATFORM_INVITE_LINK_FLASH_COOKIE,
  PLATFORM_INVITE_EMAIL_FLASH_COOKIE,
} from "@/lib/platform-invitation-flash";
import { cancelPlatformTenantInvitationAction } from "@/app/(platform)/platform-invitation-actions";
import { Button } from "@/components/ui/button";

interface PageProps {
  params: Promise<{ tenantId: string; invitationId: string }>;
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

export default async function PlatformTenantInvitationDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { tenantId, invitationId } = await params;
  const ctx = await getPlatformServiceContext(session.user.id);

  let inv;
  try {
    inv = await getPlatformTenantInvitationById(tenantId, invitationId, ctx);
  } catch (e) {
    if (e instanceof ServiceError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  }

  const c = await cookies();
  const flashLink = c.get(PLATFORM_INVITE_LINK_FLASH_COOKIE)?.value ?? null;
  const flashEmailNote = c.get(PLATFORM_INVITE_EMAIL_FLASH_COOKIE)?.value ?? null;

  return (
    <PageShell variant="default" className="space-y-6" breadcrumbLabel={inv.email}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Invitación</h1>
        <p className="text-sm text-muted-foreground">{inv.email}</p>
      </div>

      {flashLink ? (
        <section className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 dark:bg-amber-500/10">
          <h2 className="text-sm font-semibold">Enlace de invitación (copiá y compartí)</h2>
          <p className="text-xs text-muted-foreground">
            {flashEmailNote ??
              "El correo no se despachó. Este enlace incluye un token secreto: compartilo solo con el destinatario."}
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

      {inv.status === "PENDING" ? (
        <form
          action={cancelPlatformTenantInvitationAction}
          className="rounded-xl border border-border/80 bg-card p-4 shadow-sm"
        >
          <input type="hidden" name="tenantId" value={tenantId} />
          <input type="hidden" name="invitationId" value={invitationId} />
          <Button type="submit" variant="destructive" size="sm">
            Cancelar invitación
          </Button>
        </form>
      ) : null}
    </PageShell>
  );
}
