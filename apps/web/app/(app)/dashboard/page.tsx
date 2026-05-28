import Link from "next/link";
import { redirect } from "next/navigation";
import { getTenantDashboard, isPlatformSuperadmin } from "@bloqer/services";
import { Button } from "@/components/ui/button";
import {
  DashboardAccountingCard,
  DashboardAlertsCard,
  DashboardFinanceOverview,
  DashboardCashFlowChart,
  DashboardHeader,
  DashboardKpiGrid,
  DashboardOnboardingChecklist,
  DashboardProjectsOverview,
  DashboardQuickActions,
} from "@/features/dashboard";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { formatDateTime } from "@/lib/format";
import { PageShell } from "@/components/layout/page-shell";

export default async function DashboardPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");

  if (!current.tenantCtx) {
    const uid = current.session.user?.id;
    const platform = uid ? await isPlatformSuperadmin(uid) : false;
    if (platform) {
      return (
        <PageShell variant="default" className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Panel de plataforma</h1>
            <p className="text-sm text-muted-foreground">
              No tenés un tenant seleccionado. Usá la consola de plataforma para administrar organizaciones.
            </p>
          </div>
          <Button asChild>
            <Link href="/platform">Ir a la consola de plataforma</Link>
          </Button>
        </PageShell>
      );
    }
    redirect("/onboarding");
  }

  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");

  const dash = await getTenantDashboard(ctx);

  const updatedAt = formatDateTime(dash.generatedAt);

  const onboardingSteps = dash.onboardingSteps ?? [];
  const showOnboardingCard = dash.operationalOnboarding && onboardingSteps.length > 0;

  return (
    <PageShell variant="default">
      <DashboardHeader
        tenantName={dash.tenantName}
        subscription={dash.subscription}
        generatedAtLabel={updatedAt}
        unreadNotifications={dash.unreadNotifications}
        showOperationalAlertsLink={dash.showOperationalAlertsLink}
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

      {dash.cashFlowChart ? <DashboardCashFlowChart chart={dash.cashFlowChart} /> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {dash.projectSummary ? (
          <DashboardProjectsOverview summary={dash.projectSummary} showCostControlHint={dash.showCostControlHint} />
        ) : null}

        {dash.financeSummary ? <DashboardFinanceOverview finance={dash.financeSummary} /> : null}

        {dash.accountingSummary ? <DashboardAccountingCard summary={dash.accountingSummary} /> : null}
      </div>

      <DashboardQuickActions actions={dash.quickActions} />
    </PageShell>
  );
}
