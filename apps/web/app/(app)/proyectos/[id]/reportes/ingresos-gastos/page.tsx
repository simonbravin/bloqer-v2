import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  canViewProjectProfitabilityReport,
  getProjectIncomeExpenseReport,
  getProjectShellInfo,
  listApprovedBudgetsForProject,
  parseIncomeExpenseFilters,
  ServiceError,
} from "@bloqer/services";
import { IncomeExpenseChart, ReportDateFilters, ReportExportActions, ReportSubnav } from "@/features/reports";
import { PageShell } from "@/components/layout/page-shell";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { Button } from "@/components/ui/button";
import { KpiStatCard } from "@/components/ui/kpi-stat-card";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";
import { formatMoneyAmount, moneyAmountTone } from "@/lib/format-money";
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
  const filters = parseIncomeExpenseFilters(sp);

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  try {
    await getProjectShellInfo(projectId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  let report;
  let availableBudgets: Awaited<ReturnType<typeof listApprovedBudgetsForProject>> = [];
  let filterError: string | null = null;
  try {
    report = await getProjectIncomeExpenseReport(projectId, filters, ctx);
    if (report.sourcesAvailable.certifications) {
      availableBudgets = await listApprovedBudgetsForProject(projectId, ctx);
    }
  } catch (err) {
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    if (err instanceof ServiceError && (err.code === "VALIDATION" || err.code === "CONFLICT")) {
      filterError = err.message;
    } else {
      throw err;
    }
  }

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        title="Ingresos vs gastos"
        subtitle={
          report?.budgetName
            ? `${report.budgetName} · ${formatDateRange(report.dateFrom, report.dateTo)}`
            : report ? formatDateRange(report.dateFrom, report.dateTo) : undefined
        }
        actions={report ? (
          <ReportExportActions
            exportPath={`/api/reports/proyectos/${projectId}/ingresos-gastos.csv`}
            params={{
              budgetId: report.budgetId ?? undefined,
              dateFrom: report.dateFrom,
              dateTo: report.dateTo,
              currencyView: report.currencyView,
            }}
            pdf
          />
        ) : undefined}
      />

      <ReportSubnav>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${projectId}/reportes`}>← Reportes</Link>
        </Button>
        {canViewProjectProfitabilityReport(ctx.roles) ? (
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/proyectos/${projectId}/reportes/rentabilidad`}>Rentabilidad</Link>
          </Button>
        ) : null}
      </ReportSubnav>

      <ReportDateFilters
        budgets={availableBudgets}
        currentBudgetId={report?.budgetId ?? filters.budgetId}
        showCurrencyView
      />

      {!report ? <p role="alert" className="rounded-lg border bg-card p-4 text-sm">{filterError}</p> : null}

      {report && report.warnings.length > 0 && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20 p-3 space-y-1">
          {report.warnings.map((w, i) => (
            <p key={i} className="text-xs text-yellow-700 dark:text-yellow-400">
              {w}
            </p>
          ))}
        </div>
      )}

      {report?.consolidationBlocked ? (
        <p className="text-xs text-yellow-700 dark:text-yellow-400">
          Consolidado ARS no disponible. Los resultados se muestran por moneda.
        </p>
      ) : null}

      {report?.byCurrency.map(({ currency, totals, series }) => (
      <section key={currency} className="space-y-4">
      <h2 className="text-sm font-semibold">Totales en {currency}</h2>
      <KpiStatGrid title="Devengado del período" columns={4}>
        <KpiStatCard
          compact
          label="Certificado"
          value={report.sourcesAvailable.certifications ? formatMoneyAmount(totals.certifiedAmount, currency) : "—"}
        />
        <KpiStatCard
          compact
          label="Costo devengado"
          value={report.sourcesAvailable.ap ? formatMoneyAmount(totals.costAccrued, currency) : "—"}
        />
        <KpiStatCard
          compact
          label="MB devengado"
          value={totals.grossMarginAccrued == null ? "—" : formatMoneyAmount(totals.grossMarginAccrued, currency)}
          tone={totals.grossMarginAccrued == null ? "muted" : moneyAmountTone(totals.grossMarginAccrued)}
        />
        <KpiStatCard
          compact
          label="MB devengado %"
          value={totals.grossMarginAccruedPct == null ? "—" : `${totals.grossMarginAccruedPct}%`}
        />
      </KpiStatGrid>

      <KpiStatGrid title="Caja del período" columns={3}>
        <KpiStatCard
          compact
          label="Cobrado"
          value={report.sourcesAvailable.ar ? formatMoneyAmount(totals.collectedAmount, currency) : "—"}
        />
        <KpiStatCard
          compact
          label="Pagado"
          value={report.sourcesAvailable.ap ? formatMoneyAmount(totals.costPaid, currency) : "—"}
        />
        <KpiStatCard
          compact
          label="MB caja"
          value={totals.grossMarginCash == null ? "—" : formatMoneyAmount(totals.grossMarginCash, currency)}
          tone={totals.grossMarginCash == null ? "muted" : moneyAmountTone(totals.grossMarginCash)}
        />
      </KpiStatGrid>

      <IncomeExpenseChart series={series} currency={currency} sourcesAvailable={report.sourcesAvailable} />
      </section>
      ))}
    </PageShell>
  );
}
