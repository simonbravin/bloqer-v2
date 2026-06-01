import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";
import { KpiStatCard } from "@/components/ui/kpi-stat-card";
import { getCurrentUser } from "@/lib/auth";
import {
  getProjectCashFlowReport,
  getProjectCashProjectionReport,
  ServiceError,
} from "@bloqer/services";
import {
  ProjectCashFlowFilters,
  ProjectCashFlowChart,
} from "@/features/project-cash-flow";
import { ReportExportActions } from "@/features/reports";
import { ReportEmailSendDialog } from "@/features/reports/report-email-send-dialog";
import { PageShell } from "@/components/layout/page-shell";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { formatMoneyAmount } from "@/lib/format-money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { ProjectCashFlowCurrency } from "@bloqer/services";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    dateFrom?: string;
    dateTo?: string;
    period?: string;
    currency?: string;
  }>;
}

const PERIOD_LABELS: Record<string, string> = {
  day: "Por día",
  week: "Por semana",
  month: "Por mes",
};

const LAST_BUCKET_LABELS: Record<string, string> = {
  day: "Flujo del día",
  week: "Flujo de la semana",
  month: "Flujo del mes",
};

function pctDelta(current: string, previous: string): string {
  const cur = Number.parseFloat(current);
  const prev = Number.parseFloat(previous);
  if (!Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) return "0.0%";
  return `${(((cur - prev) / Math.abs(prev)) * 100).toFixed(1)}%`;
}

function toneByAmount(value: string): "success" | "danger" | "muted" {
  const num = Number.parseFloat(value);
  if (num > 0) return "success";
  if (num < 0) return "danger";
  return "muted";
}

function emptyCashCurrency(currency: string): ProjectCashFlowCurrency {
  return {
    currency,
    totalInflows: "0",
    totalOutflows: "0",
    netCashFlow: "0",
    periods: [],
    collections: [],
    payments: [],
  };
}

export default async function FlujosDeCajaPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  const sp = await searchParams;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  const period: "day" | "week" | "month" =
    sp.period === "day" || sp.period === "week" || sp.period === "month" ? sp.period : "month";
  const userSetDateFilter = Boolean(sp.dateFrom || sp.dateTo);
  const projectionFilters = userSetDateFilter
    ? { dateFrom: sp.dateFrom, dateTo: sp.dateTo, currency: sp.currency }
    : { currency: sp.currency };

  let report;
  let projection;

  try {
    [report, projection] = await Promise.all([
      getProjectCashFlowReport(
        id,
        { dateFrom: sp.dateFrom, dateTo: sp.dateTo, period, currency: sp.currency },
        ctx,
      ),
      getProjectCashProjectionReport(id, projectionFilters, ctx),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect(`/proyectos/${id}`);
    throw err;
  }

  const projectionByCurrency = new Map(projection.currencies.map((c) => [c.currency, c] as const));

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        projectId={id}
        projectName={report.project.name}
        title="Flujo de caja"
        subtitle="Ingresos, gastos y balance del período. Desglose por partida EDT."
        actions={
          <>
            <ReportExportActions
              exportPath={`/api/reports/proyectos/${id}/flujo-caja.csv`}
              params={sp}
              pdf
            />
            <ReportEmailSendDialog
              reportType="PROJECT_CASH_FLOW"
              supportsPdf={false}
              projectId={id}
              params={sp}
              defaultRecipientEmail={current.session.user?.email ?? null}
            />
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Incluye movimientos confirmados; las proyecciones se calculan desde saldos abiertos de CxC/CxP.
        </p>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/proyectos/${id}/cuentas-por-cobrar`}>Ver CxC</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/proyectos/${id}/cuentas-por-pagar`}>Ver CxP</Link>
          </Button>
        </div>
      </div>

      {report.warnings.multiCurrency && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-900/10 px-4 py-3 text-sm text-yellow-700 dark:text-yellow-400">
          Este proyecto tiene movimientos en múltiples monedas. Cada moneda se muestra por separado;
          los totales no se consolidan.
        </div>
      )}

      {report.warnings.sectionsExcluded && report.warnings.sectionsExcluded.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-200 space-y-2">
          <p className="font-medium">
            Partes del informe omitidas (módulo deshabilitado para el tenant)
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            {report.warnings.sectionsExcluded.map((s, i) => (
              <li key={i}>
                {s.module} — {s.section} ({s.reason})
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border bg-card p-4">
        <Suspense>
          <ProjectCashFlowFilters
            appliedDateFrom={report.dateFrom}
            appliedDateTo={report.dateTo}
            appliedPeriod={report.period}
          />
        </Suspense>
      </div>

      <p className="text-xs text-muted-foreground">
        Período: {report.dateFrom} → {report.dateTo} ·{" "}
        {PERIOD_LABELS[report.period] ?? report.period}
      </p>

      {(() => {
        const fallbackCurrency =
          sp.currency ??
          projection.currencies.find((c) => c.currency === "ARS")?.currency ??
          projection.currencies[0]?.currency ??
          "ARS";
        const current =
          report.currencies.find((c) => c.currency === (sp.currency ?? "")) ??
          report.currencies.find((c) => c.currency === "ARS") ??
          report.currencies[0] ??
          emptyCashCurrency(fallbackCurrency);
        const projectionCur = projectionByCurrency.get(current.currency);
        const last = current.periods[current.periods.length - 1];
        const prev = current.periods[current.periods.length - 2];
        const pendingInflows = projectionCur?.totalExpectedInflows ?? "0";
        const pendingOutflows = projectionCur?.totalExpectedOutflows ?? "0";
        const pendingHelperPrefix = userSetDateFilter ? "Pendientes" : "Pendientes (90 d)";
        const netPeriod = current.netCashFlow;
        const avgInflows = current.periods.length
          ? (Number.parseFloat(current.totalInflows) / current.periods.length).toFixed(2)
          : "0";
        const avgOutflows = current.periods.length
          ? (Number.parseFloat(current.totalOutflows) / current.periods.length).toFixed(2)
          : "0";
        const marginPct =
          Number.parseFloat(current.totalInflows) > 0
            ? ((Number.parseFloat(netPeriod) / Number.parseFloat(current.totalInflows)) * 100).toFixed(1)
            : "0.0";

        const lastBucketLabel = LAST_BUCKET_LABELS[report.period] ?? "Flujo del período";
        const lastPeriodInflowsLabel =
          report.period === "day"
            ? "Ingresos del día"
            : report.period === "week"
              ? "Ingresos de la semana"
              : "Ingresos del mes";
        const lastPeriodOutflowsLabel =
          report.period === "day"
            ? "Gastos del día"
            : report.period === "week"
              ? "Gastos de la semana"
              : "Gastos del mes";
        const lastPeriodBalanceLabel =
          report.period === "day"
            ? "Balance del día"
            : report.period === "week"
              ? "Balance de la semana"
              : "Balance del mes";

        const avgBucketLabel =
          report.period === "day" ? "día" : report.period === "week" ? "semana" : "mes";

        return (
          <div className="space-y-4">
            <KpiStatGrid title={null} columns={4}>
              <KpiStatCard
                label="Total Ingresos (acum.)"
                value={formatMoneyAmount(current.totalInflows, current.currency)}
                helper={`${pendingHelperPrefix}: ${formatMoneyAmount(pendingInflows, current.currency)}`}
                tone="success"
              />
              <KpiStatCard
                label="Total Gastos (acum.)"
                value={formatMoneyAmount(current.totalOutflows, current.currency)}
                helper={`${pendingHelperPrefix}: ${formatMoneyAmount(pendingOutflows, current.currency)}`}
                tone="danger"
              />
              <KpiStatCard
                label="Balance total (acum.)"
                value={formatMoneyAmount(netPeriod, current.currency)}
                helper="Ingresos - Gastos"
                tone={toneByAmount(netPeriod)}
              />
              <KpiStatCard
                label={lastBucketLabel}
                value={formatMoneyAmount(last?.netCashFlow ?? "0", current.currency)}
                helper={`Ingresos: ${formatMoneyAmount(last?.inflows ?? "0", current.currency)} | Gastos: ${formatMoneyAmount(last?.outflows ?? "0", current.currency)}`}
                tone={toneByAmount(last?.netCashFlow ?? "0")}
              />
            </KpiStatGrid>

            <KpiStatGrid title={null} columns={3}>
              <KpiStatCard
                label={lastPeriodInflowsLabel}
                value={formatMoneyAmount(last?.inflows ?? "0", current.currency)}
                helper={`${pctDelta(last?.inflows ?? "0", prev?.inflows ?? "0")} vs ${report.period === "day" ? "día" : report.period === "week" ? "semana" : "mes"} anterior`}
                tone="success"
              />
              <KpiStatCard
                label={lastPeriodOutflowsLabel}
                value={formatMoneyAmount(last?.outflows ?? "0", current.currency)}
                helper={`${pctDelta(last?.outflows ?? "0", prev?.outflows ?? "0")} vs ${report.period === "day" ? "día" : report.period === "week" ? "semana" : "mes"} anterior`}
                tone="danger"
              />
              <KpiStatCard
                label={lastPeriodBalanceLabel}
                value={formatMoneyAmount(last?.netCashFlow ?? "0", current.currency)}
                helper={`${pctDelta(last?.netCashFlow ?? "0", prev?.netCashFlow ?? "0")} vs ${report.period === "day" ? "día" : report.period === "week" ? "semana" : "mes"} anterior`}
                tone={toneByAmount(last?.netCashFlow ?? "0")}
              />
            </KpiStatGrid>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Resumen del Período ({report.dateFrom} → {report.dateTo})
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Total Ingresos</p>
                  <p className="text-lg font-semibold">
                    {formatMoneyAmount(current.totalInflows, current.currency)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Total Gastos</p>
                  <p className="text-lg font-semibold">
                    {formatMoneyAmount(current.totalOutflows, current.currency)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Balance Período</p>
                  <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatMoneyAmount(netPeriod, current.currency)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Promedio Ingresos/{avgBucketLabel}</p>
                  <p className="text-lg font-semibold">{formatMoneyAmount(avgInflows, current.currency)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Promedio Gastos/{avgBucketLabel}</p>
                  <p className="text-lg font-semibold">{formatMoneyAmount(avgOutflows, current.currency)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Margen del Período</p>
                  <p className="text-lg font-semibold">{marginPct}%</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Evolución temporal</CardTitle>
              </CardHeader>
              <CardContent>
                {current.periods.length > 0 ? (
                  <ProjectCashFlowChart periods={current.periods} currency={current.currency} />
                ) : (
                  <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                    Sin cobranzas ni pagos confirmados para los filtros seleccionados.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        );
      })()}
    </PageShell>
  );
}
