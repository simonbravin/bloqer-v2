import Link from "next/link";
import { formatDate, formatDateTime } from "@/lib/format";
import { platformAuditActionLabel } from "@/features/platform/platform-audit-labels";
import { notFound, redirect } from "next/navigation";
import { auth } from "@bloqer/auth";
import {
  getPlatformTenantById,
  listPlatformAuditLogForTenant,
  listPlatformTenantUsers,
  ServiceError,
} from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { getPlatformServiceContext } from "@/lib/platform-service-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
interface PageProps {
  params: Promise<{ tenantId: string }>;
}

export default async function PlatformTenantDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { tenantId } = await params;
  const ctx = await getPlatformServiceContext(session.user.id);
  let tenant;
  let users;
  let auditRows;
  try {
    [tenant, users, auditRows] = await Promise.all([
      getPlatformTenantById(tenantId, ctx),
      listPlatformTenantUsers(tenantId, ctx),
      listPlatformAuditLogForTenant(tenantId, ctx, { limit: 15 }),
    ]);
  } catch (e) {
    if (e instanceof ServiceError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  }

  const hasOwner = users.some(
    (u) => u.membershipStatus === "ACTIVE" && u.roles.includes("OWNER"),
  );

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tenant.name}</h1>
          <p className="font-mono text-sm text-muted-foreground">{tenant.slug}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!hasOwner ? (
            <Button asChild size="sm">
              <Link href={`/platform/tenants/${tenant.id}/invitations/new`}>Invitar OWNER</Link>
            </Button>
          ) : null}
          <Button asChild variant="outline" size="sm">
            <Link href={`/platform/tenants/${tenant.id}/invitations/new`}>Invitar usuario</Link>
          </Button>
        </div>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Estado operativo</dt>
          <dd className="font-medium">{tenant.status}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Suscripción (interno)</dt>
          <dd className="font-medium">{tenant.subscriptionStatus}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Plan</dt>
          <dd className="font-medium">{tenant.saasPlan}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Trial hasta</dt>
          <dd className="font-medium">{tenant.trialEndsAt ? formatDate(tenant.trialEndsAt) : "—"}</dd>
        </div>
        {tenant.suspendedReason ? (
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Motivo suspensión</dt>
            <dd>{tenant.suspendedReason}</dd>
          </div>
        ) : null}
      </dl>

      {auditRows.length > 0 ? (
        <Card className="rounded-xl border bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 pb-4">
            <CardTitle className="text-base">Actividad reciente (plataforma)</CardTitle>
            <Button variant="link" className="h-auto p-0 text-sm" asChild>
              <Link href={`/platform/registro?tenantId=${tenant.id}`}>Ver registro completo</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2 pt-4 text-sm">
            {auditRows.map((row) => (
              <div key={row.id} className="flex flex-wrap justify-between gap-2 border-b border-border/40 py-2 last:border-0">
                <div>
                  <p className="font-medium">{platformAuditActionLabel(row.action)}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.actorEmail}
                    {row.actorName ? ` (${row.actorName})` : ""}
                  </p>
                </div>
                <span className="text-muted-foreground">{formatDateTime(row.createdAt)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </PageShell>
  );
}
