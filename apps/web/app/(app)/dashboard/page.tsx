import Link from "next/link";
import { redirect } from "next/navigation";
import { getTenantDashboard, isPlatformSuperadmin } from "@bloqer/services";
import { Button } from "@/components/ui/button";
import {
  DashboardAccountingCard,
  DashboardAlertsCard,
  DashboardFinanceOverview,
  DashboardHeader,
  DashboardKpiGrid,
  DashboardOnboardingChecklist,
  DashboardProjectsOverview,
  DashboardQuickActions,
  DashboardStatusDistribution,
  InventorySummaryCard,
  dashboardHeaderQuickNav,
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
        <div className="shell-page-narrow">
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
    <div className="shell-page">
      <DashboardHeader
        tenantName={dash.tenantName}
        subscription={dash.subscription}
        generatedAtLabel={updatedAt}
        unreadNotifications={dash.unreadNotifications}
        showOperationalAlertsLink={dash.showOperationalAlertsLink}
        quickNavLinks={dashboardHeaderQuickNav(dash.quickActions)}
      />

      <DashboardAlertsCard warnings={dash.warnings} />

      {showOnboardingCard ? <DashboardOnboardingChecklist steps={onboardingSteps} /> : null}

      {dash.operationalOnboarding && onboardingSteps.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
          Todavía no hay datos en el tablero. Cuando tengas permisos para crear proyectos, contactos o
          configuración, van a aparecer pasos sugeridos acá.
        </p>
      ) : null}

      <DashboardKpiGrid kpis={dash.kpis} />

      {dash.projectStatusSlices.length > 0 ? (
        <DashboardStatusDistribution slices={dash.projectStatusSlices} />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {dash.projectSummary ? (
          <DashboardProjectsOverview summary={dash.projectSummary} showCostControlHint={dash.showCostControlHint} />
        ) : null}

        {dash.financeSummary ? <DashboardFinanceOverview finance={dash.financeSummary} /> : null}

        {dash.inventorySummary ? <InventorySummaryCard summary={dash.inventorySummary} /> : null}

        {dash.accountingSummary ? <DashboardAccountingCard summary={dash.accountingSummary} /> : null}
      </div>

      <DashboardQuickActions actions={dash.quickActions} />
    </div>
  );
}
