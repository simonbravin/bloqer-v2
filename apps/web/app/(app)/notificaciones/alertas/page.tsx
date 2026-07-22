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
          {" · "}
          <Link href="/notificaciones/emails" className="text-primary underline-offset-4 hover:underline">
            Historial de emails
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Alertas operativas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          En producción las alertas corren solas todos los días a las <strong>12:00 UTC</strong> (cron
          de Vercel). Los vencimientos AR/AP usan <strong>día calendario UTC</strong> (vencen si la fecha
          de vencimiento es estrictamente anterior a hoy UTC). Este panel es solo para corridas
          manuales (smoke, demos o si el cron falló): AR/AP vencidos, stock negativo, certificaciones sin
          factura, cargas de documentos pendientes. Los duplicados recientes (7 días) se omiten. Solo
          OWNER o ADMIN.
        </p>
      </div>

      <OperationalAlertsActivityCard activity={activity} />
      <OperationalAlertsPanel />
    </PageShell>
  );
}
