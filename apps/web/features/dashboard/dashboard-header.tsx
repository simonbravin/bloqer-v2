import Link from "next/link";
import type { DashboardQuickAction, TenantSubscriptionInfo } from "@bloqer/services";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/** Canonical header shortcuts; only shown if the same `href` is present in server-built `quickActions` (permission + module gated). */
const HEADER_QUICK_NAV: { label: string; href: string }[] = [
  { label: "Nuevo proyecto", href: "/proyectos/nuevo" },
  { label: "Crear contacto", href: "/directorio/nuevo" },
  { label: "Registrar movimiento", href: "/tesoreria/cuentas" },
  { label: "Ver finanzas", href: "/finanzas" },
  { label: "Ver contabilidad", href: "/contabilidad" },
  { label: "Configuración", href: "/configuracion" },
];

export function dashboardHeaderQuickNav(quickActions: DashboardQuickAction[]): { label: string; href: string }[] {
  const allowed = new Set(quickActions.map((a) => a.href));
  return HEADER_QUICK_NAV.filter((item) => allowed.has(item.href));
}

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
  quickNavLinks,
}: {
  tenantName: string;
  subscription: TenantSubscriptionInfo | null;
  generatedAtLabel: string;
  unreadNotifications: number;
  showOperationalAlertsLink: boolean;
  quickNavLinks: { label: string; href: string }[];
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
                  <span>Prueba hasta {new Date(subscription.trialEndsAt + "T12:00:00").toLocaleDateString("es-AR")}</span>
                </>
              ) : null}
            </div>
          ) : null}
          {quickNavLinks.length > 0 ? (
            <nav aria-label="Accesos rápidos del encabezado" className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-sm">
              {quickNavLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {l.label}
                </Link>
              ))}
            </nav>
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
