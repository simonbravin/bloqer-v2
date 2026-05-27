import { formatDate } from "@/lib/format";
import Link from "next/link";
import type { TenantSubscriptionInfo } from "@bloqer/services";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const SUB_LABEL: Record<string, string> = {
  TRIAL: "Prueba",
  ACTIVE: "Activo",
  PAST_DUE: "Pago pendiente",
  CANCELLED: "Cancelado",
  NONE: "Sin plan",
};

function subscriptionBadge(status: string): string {
  return SUB_LABEL[status] ?? status;
}

export function DashboardHeader({
  tenantName,
  subscription,
  generatedAtLabel,
  unreadNotifications,
  showOperationalAlertsLink,
}: {
  tenantName: string;
  subscription: TenantSubscriptionInfo | null;
  generatedAtLabel: string;
  unreadNotifications: number;
  showOperationalAlertsLink: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Panel de control</h1>
          <p className="truncate text-lg font-medium text-foreground">{tenantName}</p>
          {subscription?.trialWarning ? (
            <p
              className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-foreground"
              role="status"
            >
              {subscription.trialWarning}
            </p>
          ) : null}
          {subscription ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>Plan: {subscription.saasPlan}</span>
              <span>·</span>
              <Badge variant="secondary">{subscriptionBadge(subscription.subscriptionStatus)}</Badge>
              {subscription.trialEndsAt ? (
                <>
                  <span>·</span>
                  <span>Prueba hasta {formatDate(subscription.trialEndsAt + "T12:00:00")}</span>
                </>
              ) : null}
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">Última actualización: {generatedAtLabel}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {unreadNotifications > 0 ? (
            <Button asChild size="sm" variant="secondary">
              <Link href="/notificaciones">{unreadNotifications} sin leer</Link>
            </Button>
          ) : null}
          {showOperationalAlertsLink ? (
            <Button asChild size="sm" variant="outline">
              <Link href="/notificaciones/alertas">Alertas operativas</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
