import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canRunOperationalAlerts, getOperationalAlertsLastActivity } from "@bloqer/services";
import { OperationalAlertsPanel } from "./operational-alerts-panel";
import { OperationalAlertsActivityCard } from "./operational-alerts-activity-card";
import { PageShell } from "@/components/layout/page-shell";

export default async function OperationalAlertsPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) notFound();

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  if (!canRunOperationalAlerts(ctx)) notFound();

  const activity = await getOperationalAlertsLastActivity(ctx);

  return (
    <PageShell variant="default" className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href="/notificaciones" className="text-primary underline-offset-4 hover:underline">
            ← Volver a notificaciones
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Alertas operativas</h1>
      </div>

      <OperationalAlertsActivityCard activity={activity} />
      <OperationalAlertsPanel />
    </PageShell>
  );
}
