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
import { formatUserRoleList } from "@/lib/user-role-label";
import { PageShell } from "@/components/layout/page-shell";
import { PageListHeader } from "@/components/ui/page-list-header";
import { DetailField, DetailFieldGrid } from "@/components/ui/detail-field-grid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <PageListHeader title="Invitación" subtitle={inv.email} />

      {flashLink ? (
        <Card className="border-amber-500/40 bg-amber-500/5 dark:bg-amber-500/10">
          <CardHeader>
            <CardTitle className="text-base">Enlace de invitación (copiá y compartí)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {flashEmailNote ??
                "El correo no se despachó (integración desactivada, URL pública de la app ausente o inválida, o fallo del proveedor). Este enlace incluye un token secreto: no lo publiques en lugares públicos."}
            </p>
            <p className="break-all font-mono text-xs">{flashLink}</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detalle</CardTitle>
        </CardHeader>
        <CardContent>
          <DetailFieldGrid>
            <DetailField label="Estado">{invitationStatusLabel(inv.status)}</DetailField>
            <DetailField label="Roles">{formatUserRoleList(inv.roles)}</DetailField>
            <DetailField label="Invitó">{inv.invitedByEmail}</DetailField>
            <DetailField label="Vence">{formatDateTime(inv.expiresAt)}</DetailField>
            <DetailField label="Creada">{formatDateTime(inv.createdAt)}</DetailField>
          </DetailFieldGrid>
        </CardContent>
      </Card>

      {canEdit && inv.status === "PENDING" ? (
        <Card>
          <CardContent className="pt-6">
            <form action={cancelTenantInvitationAction}>
              <input type="hidden" name="invitationId" value={inv.id} />
              <Button type="submit" variant="destructive" size="sm">
                Cancelar invitación
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </PageShell>
  );
}
