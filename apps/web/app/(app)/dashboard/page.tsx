import Link from "next/link";
import { redirect } from "next/navigation";
import { getTenantDashboard, isPlatformSuperadmin } from "@bloqer/services";
import { Button } from "@/components/ui/button";
import {
  DashboardEmptyState,
  DashboardKpiCard,
  FinanceSummaryCard,
  InventorySummaryCard,
  ProjectProgressCard,
  QuickActionsCard,
} from "@/features/dashboard";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";

export default async function DashboardPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");

  if (!current.tenantCtx) {
    const uid = current.session.user?.id;
    const platform = uid ? await isPlatformSuperadmin(uid) : false;
    if (platform) {
      return (
        <div className="mx-auto max-w-lg space-y-4">
          <h1 className="text-2xl font-bold tracking-tight">Panel de plataforma</h1>
          <p className="text-sm text-muted-foreground">
            No tenés un tenant seleccionado. Desde acá podés administrar organizaciones.
          </p>
          <Button asChild variant="link" className="h-auto p-0">
            <Link href="/platform">Ir al panel de plataforma</Link>
          </Button>
        </div>
      );
    }
    redirect("/onboarding");
  }

  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");

  const dash = await getTenantDashboard(ctx);

  const updatedAt = new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(dash.generatedAt));

  const onboardingSteps = dash.onboardingSteps ?? [];
  const showOnboardingCard = dash.operationalOnboarding && onboardingSteps.length > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bienvenido a Bloqer</h1>
          <p className="text-muted-foreground">{dash.tenantName}</p>
          <p className="mt-2 text-xs text-muted-foreground">Última actualización: {updatedAt}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dash.unreadNotifications > 0 ? (
            <Button asChild size="sm" variant="secondary">
              <Link href="/notificaciones">{dash.unreadNotifications} notificaciones sin leer</Link>
            </Button>
          ) : null}
          {dash.showOperationalAlertsLink ? (
            <Button asChild size="sm" variant="outline">
              <Link href="/notificaciones/alertas">Alertas operativas</Link>
            </Button>
          ) : null}
        </div>
      </div>

      {showOnboardingCard ? <DashboardEmptyState steps={onboardingSteps} /> : null}

      {dash.operationalOnboarding && onboardingSteps.length === 0 ? (
        <p className="rounded-md border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
          Todavía no hay datos en el tablero. Cuando tengas permisos para crear proyectos, contactos o
          configuración, van a aparecer pasos sugeridos acá.
        </p>
      ) : null}

      {dash.kpis.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {dash.kpis.map((k) => (
            <DashboardKpiCard key={k.key} kpi={k} />
          ))}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {dash.projectSummary ? (
          <ProjectProgressCard summary={dash.projectSummary} showCostControlHint={dash.showCostControlHint} />
        ) : null}

        {dash.financeSummary ? <FinanceSummaryCard finance={dash.financeSummary} /> : null}

        {dash.inventorySummary ? <InventorySummaryCard summary={dash.inventorySummary} /> : null}
      </div>

      <QuickActionsCard actions={dash.quickActions} />
    </div>
  );
}
