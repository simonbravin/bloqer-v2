import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";
import { KpiStatCard } from "@/components/ui/kpi-stat-card";
import { getCurrentUser } from "@/lib/auth";
import {
  getProjectCashFlowReport,
  getProjectCashProjectionReport,
  getProjectCashPositionProjection,
  resolveProjectionAsOfDate,
  ServiceError,
} from "@bloqer/services";
import {
  ProjectCashFlowFilters,
  ProjectCashFlowChart,
  ProjectCashPositionProjectionPanel,
} from "@/features/project-cash-flow";
import { ReportExportActions } from "@/features/reports";
import { ReportEmailSendDialog } from "@/features/reports/report-email-send-dialog";
import { PageShell } from "@/components/layout/page-shell";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { addDecimal, divideDecimal, multiplyDecimal, serializeMoney } from "@bloqer/utils";
import { formatMoneyAmount, moneyAmountTone } from "@/lib/format-money";
import { formatDateRange } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProjectCashFlowCurrency } from "@bloqer/services";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    dateFrom?: string;
    dateTo?: string;
    period?: string;
    currency?: string;
    projectionDate?: string;
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
  try {
    const prev = serializeMoney(previous);
    if (prev === "0.00") return "0.0%";
    const cur = serializeMoney(current);
    const diff = addDecimal(cur, multiplyDecimal(prev, -1));
    const absPrev = prev.startsWith("-") ? prev.slice(1) : prev;
    return `${divideDecimal(multiplyDecimal(diff, "100"), absPrev, 1)}%`;
  } catch {
    return "0.0%";
  }
}

function toneByAmount(value: string): "success" | "danger" | "muted" {
  return moneyAmountTone(value);
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

  const projectionActive = Boolean(sp.projectionDate);
  const appliedProjectionDate = resolveProjectionAsOfDate(sp.projectionDate);

  let report;
  let projection;
  let positionProjection;

  try {
    [report, projection, positionProjection] = await Promise.all([
      getProjectCashFlowReport(
        id,
        { dateFrom: sp.dateFrom, dateTo: sp.dateTo, period, currency: sp.currency },
        ctx,
      ),
      getProjectCashProjectionReport(id, projectionFilters, ctx),
      projectionActive
        ? getProjectCashPositionProjection(
            id,
            { asOfDate: sp.projectionDate, currency: sp.currency },
            ctx,
          )
        : Promise.resolve(null),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect(`/proyectos/${id}`);
    throw err;
  }

  const projectionByCurrency = new Map(projection.currencies.map((c) => [c.currency, c] as const));
  const actualByCurrency = new Map(report.currencies.map((c) => [c.currency, c] as const));
  const currencyKeys = [...new Set([...actualByCurrency.keys(), ...projectionByCurrency.keys()])];
  const cashCurrencies = (currencyKeys.length > 0 ? currencyKeys : [sp.currency ?? "ARS"]).map(
    (currency) => actualByCurrency.get(currency) ?? emptyCashCurrency(currency),
  );
  const exclusions = report.warnings.sectionsExcluded ?? [];
  const inflowsAvailable = !exclusions.some((entry) => entry.module === "AR");
  const outflowsAvailable = !exclusions.some((entry) => entry.module === "AP");
  const partial = !inflowsAvailable || !outflowsAvailable;

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        title="Flujo de caja"
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
              params={sp}
              defaultRecipientEmail={current.session.user?.email ?? null}
            />
          </>
        }
      />

      <ProjectCashPositionProjectionPanel
        projectId={id}
        report={positionProjection}
        active={projectionActive}
        appliedAsOfDate={appliedProjectionDate}
      />

      {cashCurrencies.length > 1 && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-900/10 px-4 py-3 text-sm text-yellow-700 dark:text-yellow-400">
          Este proyecto tiene movimientos en múltiples monedas. Cada moneda se muestra por separado;
          los totales no se consolidan.
        </div>
      )}

      {partial && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-200 space-y-2">
          <p className="font-medium">
            Secciones no disponibles. Los saldos incluyen los movimientos visibles.
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            {exclusions.map(({ module, reason }) => (
              <li key={module}>
                {module === "AR" ? "Cobranzas" : "Pagos"} ·{" "}
                {reason === "MISSING_PERMISSION" ? "Sin permiso" : "Módulo deshabilitado"}
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
        Período: {formatDateRange(report.dateFrom, report.dateTo)} ·{" "}
        {PERIOD_LABELS[report.period] ?? report.period}
      </p>

      {cashCurrencies.map((current) => {
        const projectionCur = projectionByCurrency.get(current.currency);
        const last = current.periods[current.periods.length - 1];
        const prev = current.periods[current.periods.length - 2];
        const pendingInflows = projectionCur?.totalExpectedInflows ?? "0";
        const pendingOutflows = projectionCur?.totalExpectedOutflows ?? "0";
        const pendingHelperPrefix = userSetDateFilter ? "Pendientes" : "Pendientes (90 d)";
        const netPeriod = current.netCashFlow;
        const avgInflows = current.periods.length
          ? divideDecimal(current.totalInflows, String(current.periods.length), 2)
          : "0.00";
        const avgOutflows = current.periods.length
          ? divideDecimal(current.totalOutflows, String(current.periods.length), 2)
          : "0.00";
        let marginPct = "0.0";
        try {
          if (serializeMoney(current.totalInflows) !== "0.00") {
            marginPct = divideDecimal(
              multiplyDecimal(netPeriod, "100"),
              current.totalInflows,
              1,
            );
          }
        } catch {
          marginPct = "0.0";
        }

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
        const inflow = (amount: string) => inflowsAvailable ? formatMoneyAmount(amount, current.currency) : "—";
        const outflow = (amount: string) => outflowsAvailable ? formatMoneyAmount(amount, current.currency) : "—";

        return (
          <section key={current.currency} className="space-y-4">
            <h2 className="text-sm font-semibold">Movimientos en {current.currency}</h2>
            <KpiStatGrid title={null} columns={4}>
              <KpiStatCard
                label="Total Ingresos (acum.)"
                value={inflow(current.totalInflows)}
                helper={inflowsAvailable ? `${pendingHelperPrefix}: ${inflow(pendingInflows)}` : undefined}
                tone="success"
              />
              <KpiStatCard
                label="Total Gastos (acum.)"
                value={outflow(current.totalOutflows)}
                helper={outflowsAvailable ? `${pendingHelperPrefix}: ${outflow(pendingOutflows)}` : undefined}
                tone="danger"
              />
              <KpiStatCard
                label={partial ? "Saldo visible (acum.)" : "Balance total (acum.)"}
                value={formatMoneyAmount(netPeriod, current.currency)}
                helper={partial ? undefined : "Ingresos - Gastos"}
                tone={toneByAmount(netPeriod)}
              />
              <KpiStatCard
                label={lastBucketLabel}
                value={formatMoneyAmount(last?.netCashFlow ?? "0", current.currency)}
                helper={`Ingresos: ${inflow(last?.inflows ?? "0")} | Gastos: ${outflow(last?.outflows ?? "0")}`}
                tone={toneByAmount(last?.netCashFlow ?? "0")}
              />
            </KpiStatGrid>

            <KpiStatGrid title={null} columns={3}>
              <KpiStatCard
                label={lastPeriodInflowsLabel}
                value={inflow(last?.inflows ?? "0")}
                helper={inflowsAvailable ? `${pctDelta(last?.inflows ?? "0", prev?.inflows ?? "0")} vs ${avgBucketLabel} anterior` : undefined}
                tone="success"
              />
              <KpiStatCard
                label={lastPeriodOutflowsLabel}
                value={outflow(last?.outflows ?? "0")}
                helper={outflowsAvailable ? `${pctDelta(last?.outflows ?? "0", prev?.outflows ?? "0")} vs ${avgBucketLabel} anterior` : undefined}
                tone="danger"
              />
              <KpiStatCard
                label={partial ? "Saldo visible del último período" : lastPeriodBalanceLabel}
                value={formatMoneyAmount(last?.netCashFlow ?? "0", current.currency)}
                helper={`${pctDelta(last?.netCashFlow ?? "0", prev?.netCashFlow ?? "0")} vs ${report.period === "day" ? "día" : report.period === "week" ? "semana" : "mes"} anterior`}
                tone={toneByAmount(last?.netCashFlow ?? "0")}
              />
            </KpiStatGrid>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Resumen del Período ({formatDateRange(report.dateFrom, report.dateTo)})
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Total Ingresos</p>
                  <p className="text-lg font-semibold">
                    {inflow(current.totalInflows)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Total Gastos</p>
                  <p className="text-lg font-semibold">
                    {outflow(current.totalOutflows)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{partial ? "Saldo visible" : "Balance del período"}</p>
                  <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatMoneyAmount(netPeriod, current.currency)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Promedio Ingresos/{avgBucketLabel}</p>
                  <p className="text-lg font-semibold">{inflow(avgInflows)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Promedio Gastos/{avgBucketLabel}</p>
                  <p className="text-lg font-semibold">{outflow(avgOutflows)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Margen del Período</p>
                  <p className="text-lg font-semibold">{partial ? "—" : `${marginPct}%`}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Evolución temporal</CardTitle>
              </CardHeader>
              <CardContent>
                {current.periods.length > 0 ? (
                  <ProjectCashFlowChart
                    periods={current.periods}
                    currency={current.currency}
                    inflowsAvailable={inflowsAvailable}
                    outflowsAvailable={outflowsAvailable}
                  />
                ) : (
                  <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                    Sin cobranzas ni pagos confirmados para los filtros seleccionados.
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        );
      })}
    </PageShell>
  );
}
