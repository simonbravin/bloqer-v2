import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canRunOperationalAlerts } from "@bloqer/services";
import { OperationalAlertsPanel } from "./operational-alerts-panel";
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
          Generá notificaciones in-app según reglas del tenant (AR/AP vencidos, stock negativo, certificaciones sin
          factura, cargas de documentos pendientes). Los duplicados recientes se omiten automáticamente. Solo OWNER o
          ADMIN.
        </p>
      </div>

      <OperationalAlertsPanel />
    </PageShell>
  );
}
