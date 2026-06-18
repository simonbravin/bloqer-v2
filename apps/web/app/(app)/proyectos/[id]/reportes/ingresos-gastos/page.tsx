import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getProjectCostControl,
  getProjectIncomeExpenseReport,
  getProjectShellInfo,
  parseCurrencyView,
  ServiceError,
} from "@bloqer/services";
import { IncomeExpenseChart, ReportDateFilters, ReportExportActions } from "@/features/reports";
import { PageShell } from "@/components/layout/page-shell";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { Button } from "@/components/ui/button";
import { KpiStatCard } from "@/components/ui/kpi-stat-card";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";
import { formatMoneyAmount } from "@/lib/format-money";
import { formatDateRange } from "@/lib/format";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ budgetId?: string; dateFrom?: string; dateTo?: string; currencyView?: string }>;
}

export default async function ReporteIngresosGastosPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id: projectId } = await params;
  const sp = await searchParams;

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  try {
    await getProjectShellInfo(projectId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  let report;
  let budgetProbe;
  try {
    [report, budgetProbe] = await Promise.all([
      getProjectIncomeExpenseReport(
        projectId,
        {
          budgetId: sp.budgetId,
          dateFrom: sp.dateFrom,
          dateTo: sp.dateTo,
          currencyView: parseCurrencyView(sp.currencyView),
        },
        ctx,
      ),
      getProjectCostControl(projectId, { budgetId: sp.budgetId }, ctx),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  const availableBudgets =
    budgetProbe.type === "NO_APPROVED_BUDGETS" ? [] : budgetProbe.availableBudgets;

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        title="Ingresos vs gastos"
        subtitle={
          report.budgetName
            ? `${report.budgetName} · ${formatDateRange(report.dateFrom, report.dateTo)}`
            : formatDateRange(report.dateFrom, report.dateTo)
        }
        actions={
          <ReportExportActions
            exportPath={`/api/reports/proyectos/${projectId}/ingresos-gastos.csv`}
            params={sp}
            pdf
          />
        }
      />

      <div className="flex flex-wrap gap-2 text-sm">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${projectId}/reportes`}>← Reportes</Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${projectId}/reportes/rentabilidad`}>Rentabilidad</Link>
        </Button>
      </div>

      <ReportDateFilters
        budgets={availableBudgets}
        currentBudgetId={sp.budgetId}
        showCurrencyView
      />

      {report.warnings.length > 0 && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20 p-3 space-y-1">
          {report.warnings.map((w, i) => (
            <p key={i} className="text-xs text-yellow-700 dark:text-yellow-400">
              {w}
            </p>
          ))}
        </div>
      )}

      {report.consolidationBlocked ? (
        <p className="text-xs text-yellow-700 dark:text-yellow-400">
          Consolidado ARS no disponible; KPIs en moneda del presupuesto ({report.displayCurrency}).
        </p>
      ) : null}

      <KpiStatGrid title="Totales del período (devengado vs caja)" columns={4}>
        <KpiStatCard
          label="Certificado"
          value={formatMoneyAmount(report.totals.certifiedAmount, report.displayCurrency)}
        />
        <KpiStatCard
          label="Costo devengado"
          value={formatMoneyAmount(report.totals.costAccrued, report.displayCurrency)}
        />
        <KpiStatCard
          label="MB devengado"
          value={formatMoneyAmount(report.totals.grossMarginAccrued, report.displayCurrency)}
          tone={parseFloat(report.totals.grossMarginAccrued) >= 0 ? "success" : "danger"}
        />
        <KpiStatCard
          label="MB devengado %"
          value={report.totals.grossMarginAccruedPct ?? "—"}
        />
      </KpiStatGrid>

      <KpiStatGrid title={null} columns={3}>
        <KpiStatCard
          label="Cobrado"
          value={formatMoneyAmount(report.totals.collectedAmount, report.displayCurrency)}
        />
        <KpiStatCard
          label="Pagado"
          value={formatMoneyAmount(report.totals.costPaid, report.displayCurrency)}
        />
        <KpiStatCard
          label="MB caja"
          value={formatMoneyAmount(report.totals.grossMarginCash, report.displayCurrency)}
          tone={parseFloat(report.totals.grossMarginCash) >= 0 ? "success" : "danger"}
        />
      </KpiStatGrid>

      <IncomeExpenseChart series={report.series} />
    </PageShell>
  );
}
