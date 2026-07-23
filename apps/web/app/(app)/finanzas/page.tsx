import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getFinanceHubCharts, getFinanceHubOverview } from "@bloqer/services";
import { FinanceHubView } from "@/features/finance";
import { FinanceHubChartsPanel } from "@/features/finance/components/finance-hub-charts-panel";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { PageShell } from "@/components/layout/page-shell";

interface PageProps {
  searchParams: Promise<{ months?: string; trend?: string }>;
}

export default async function FinanzasPage({ searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");

  const sp = await searchParams;
  const months = sp.months === "6" ? 6 : 12;

  const [overview, charts] = await Promise.all([
    getFinanceHubOverview(ctx),
    getFinanceHubCharts(ctx, { months }),
  ]);

  const hasCash = charts.cash != null && charts.cash.buckets.length > 0;
  const hasEconomic = charts.economic != null && charts.economic.series.length > 0;
  const defaultTab =
    sp.trend === "economico"
      ? "economico"
      : sp.trend === "caja"
        ? "caja"
        : hasCash
          ? "caja"
          : hasEconomic
            ? "economico"
            : "caja";

  return (
    <PageShell variant="default" className="space-y-8">
      <h1 className="text-2xl font-bold tracking-tight">Finanzas</h1>

      <FinanceHubView overview={overview} />

      <Suspense fallback={null}>
        <FinanceHubChartsPanel charts={charts} defaultTab={defaultTab} />
      </Suspense>
    </PageShell>
  );
}
