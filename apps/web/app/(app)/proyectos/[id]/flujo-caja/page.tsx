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

  const period =
    sp.period === "day" || sp.period === "week" || sp.period === "month" ? sp.period : undefined;

  let report;
  let projection;

  try {
    report = await getProjectCashFlowReport(
      id,
      { dateFrom: sp.dateFrom, dateTo: sp.dateTo, period, currency: sp.currency },
      ctx,
    );
    projection = await getProjectCashProjectionReport(
      id,
      { dateFrom: sp.dateFrom, dateTo: sp.dateTo, currency: sp.currency },
      ctx,
    );
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const projectionByCurrency = new Map(projection.currencies.map((c) => [c.currency, c] as const));

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        projectId={id}
        projectName={report.project.name}
        title="Cashflow del proyecto"
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
          <ProjectCashFlowFilters />
        </Suspense>
      </div>

      <p className="text-xs text-muted-foreground">
        Período: {report.dateFrom} → {report.dateTo} ·{" "}
        {PERIOD_LABELS[report.period] ?? report.period}
      </p>

      {report.currencies.length === 0 && (
        <div className="rounded-lg border bg-card p-12 text-center text-sm text-muted-foreground">
          Sin cobranzas ni pagos confirmados para los filtros seleccionados.
        </div>
      )}

      {report.currencies.map((cur) => (
        <div key={cur.currency} className="space-y-4">
          <h2 className="font-semibold text-lg">{cur.currency}</h2>
          {(() => {
            const last = cur.periods[cur.periods.length - 1];
            const prev = cur.periods[cur.periods.length - 2];
            const projectionCur = projectionByCurrency.get(cur.currency);
            const pendingInflows = projectionCur?.totalExpectedInflows ?? "0";
            const pendingOutflows = projectionCur?.totalExpectedOutflows ?? "0";
            const netPeriod = cur.netCashFlow;
            const avgInflows = cur.periods.length
              ? (Number.parseFloat(cur.totalInflows) / cur.periods.length).toFixed(2)
              : "0";
            const avgOutflows = cur.periods.length
              ? (Number.parseFloat(cur.totalOutflows) / cur.periods.length).toFixed(2)
              : "0";
            const marginPct =
              Number.parseFloat(cur.totalInflows) > 0
                ? ((Number.parseFloat(netPeriod) / Number.parseFloat(cur.totalInflows)) * 100).toFixed(1)
                : "0.0";

            return (
              <>
                <KpiStatGrid title={null} columns={4}>
                  <KpiStatCard
                    label="Total Ingresos (acum.)"
                    value={formatMoneyAmount(cur.totalInflows, cur.currency)}
                    helper={`Pendientes: ${formatMoneyAmount(pendingInflows, cur.currency)}`}
                    tone="success"
                  />
                  <KpiStatCard
                    label="Total Gastos (acum.)"
                    value={formatMoneyAmount(cur.totalOutflows, cur.currency)}
                    helper={`Pendientes: ${formatMoneyAmount(pendingOutflows, cur.currency)}`}
                    tone="danger"
                  />
                  <KpiStatCard
                    label="Balance total (acum.)"
                    value={formatMoneyAmount(netPeriod, cur.currency)}
                    helper="Ingresos - Gastos"
                    tone={toneByAmount(netPeriod)}
                  />
                  <KpiStatCard
                    label="Flujo del Mes"
                    value={formatMoneyAmount(last?.netCashFlow ?? "0", cur.currency)}
                    helper={`Ingresos: ${formatMoneyAmount(last?.inflows ?? "0", cur.currency)} | Gastos: ${formatMoneyAmount(last?.outflows ?? "0", cur.currency)}`}
                    tone={toneByAmount(last?.netCashFlow ?? "0")}
                  />
                </KpiStatGrid>

                <KpiStatGrid title={null} columns={3}>
                  <KpiStatCard
                    label="Ingresos del Mes"
                    value={formatMoneyAmount(last?.inflows ?? "0", cur.currency)}
                    helper={`${pctDelta(last?.inflows ?? "0", prev?.inflows ?? "0")} vs mes anterior`}
                    tone="success"
                  />
                  <KpiStatCard
                    label="Gastos del Mes"
                    value={formatMoneyAmount(last?.outflows ?? "0", cur.currency)}
                    helper={`${pctDelta(last?.outflows ?? "0", prev?.outflows ?? "0")} vs mes anterior`}
                    tone="danger"
                  />
                  <KpiStatCard
                    label="Balance del Mes"
                    value={formatMoneyAmount(last?.netCashFlow ?? "0", cur.currency)}
                    helper={`${pctDelta(last?.netCashFlow ?? "0", prev?.netCashFlow ?? "0")} vs mes anterior`}
                    tone={toneByAmount(last?.netCashFlow ?? "0")}
                  />
                </KpiStatGrid>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">
                      Resumen del Período ({report.dateFrom} - {report.dateTo})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Total Ingresos</p>
                      <p className="text-lg font-semibold">{formatMoneyAmount(cur.totalInflows, cur.currency)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Total Gastos</p>
                      <p className="text-lg font-semibold">{formatMoneyAmount(cur.totalOutflows, cur.currency)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Balance Período</p>
                      <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatMoneyAmount(netPeriod, cur.currency)}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Promedio Ingresos/Mes</p>
                      <p className="text-lg font-semibold">{formatMoneyAmount(avgInflows, cur.currency)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Promedio Gastos/Mes</p>
                      <p className="text-lg font-semibold">{formatMoneyAmount(avgOutflows, cur.currency)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Margen del Período</p>
                      <p className="text-lg font-semibold">{marginPct}%</p>
                    </div>
                  </CardContent>
                </Card>
              </>
            );
          })()}

          <ProjectCashFlowChart periods={cur.periods} currency={cur.currency} />

          {report.currencies.length > 1 && <hr className="border-border" />}
        </div>
      ))}
    </PageShell>
  );
}
