import Link from "next/link";
import { cookies } from "next/headers";
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
  DashboardProjectsOverview,
  DashboardQuickActions,
} from "@/features/dashboard";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { formatDateTime } from "@/lib/format";
import { PageShell } from "@/components/layout/page-shell";
import { Suspense } from "react";
import { FieldHomeFallback, FieldHomeLoader } from "@/features/field/components/field-home-loader";
import { parseViewportHint, VIEWPORT_COOKIE } from "@/lib/viewport-hint-cookie";

async function DesktopDashboard() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  if (!current.tenantCtx) redirect("/login");
  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");

  const dash = await getTenantDashboard(ctx);
  const updatedAt = formatDateTime(dash.generatedAt);

  return (
    <div data-testid="desktop-dashboard">
      <PageShell variant="default">
        <DashboardHeader
          tenantName={dash.tenantName}
          subscription={dash.subscription}
          generatedAtLabel={updatedAt}
          unreadNotifications={dash.unreadNotifications}
          showOperationalAlertsLink={dash.showOperationalAlertsLink}
        />
        <DashboardAlertsCard warnings={dash.warnings} />
        <DashboardKpiGrid kpis={dash.kpis} />
        {dash.cashFlowChart ? <DashboardCashFlowChart chart={dash.cashFlowChart} /> : null}
        <div className="grid gap-6 lg:grid-cols-2">
          {dash.projectSummary ? <DashboardProjectsOverview summary={dash.projectSummary} /> : null}
          {dash.financeSummary ? <DashboardFinanceOverview finance={dash.financeSummary} /> : null}
          {dash.accountingSummary ? <DashboardAccountingCard summary={dash.accountingSummary} /> : null}
        </div>
        <DashboardQuickActions actions={dash.quickActions} />
      </PageShell>
    </div>
  );
}

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

  const jar = await cookies();
  const hint = parseViewportHint(jar.get(VIEWPORT_COOKIE)?.value);
  const showFieldHome = hint !== "md";
  const showDesktop = hint !== "sm";

  return (
    <>
      {showFieldHome ? (
        <div className={showDesktop ? "md:hidden" : undefined}>
          <Suspense fallback={<FieldHomeFallback />}>
            <FieldHomeLoader />
          </Suspense>
        </div>
      ) : null}
      {showDesktop ? (
        <div className={showFieldHome ? "hidden md:block" : undefined}>
          <Suspense fallback={null}>
            <DesktopDashboard />
          </Suspense>
        </div>
      ) : null}
    </>
  );
}
