import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getProjectCashFlowReport,
  getProjectCashProjectionReport,
  getProjectShellInfo,
  ServiceError,
} from "@bloqer/services";
import { CashProjectionChart } from "@/features/reports/cash-projection-chart";
import { ReportExportActions, ReportSubnav } from "@/features/reports";
import { ProjectCashFlowChart, ProjectCashFlowFilters } from "@/features/project-cash-flow";
import { PageShell } from "@/components/layout/page-shell";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiStatCard } from "@/components/ui/kpi-stat-card";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";
import { formatMoneyAmount } from "@/lib/format-money";
import { formatDateRange } from "@/lib/format";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    dateFrom?: string;
    dateTo?: string;
    period?: string;
    currency?: string;
  }>;
}

export default async function ReporteCajaPage({ params, searchParams }: PageProps) {
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
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect(`/proyectos/${projectId}`);
    throw err;
  }

  const period: "day" | "week" | "month" =
    sp.period === "day" || sp.period === "week" || sp.period === "month" ? sp.period : "month";
  const userSetDateFilter = Boolean(sp.dateFrom || sp.dateTo);
  const projectionFilters = userSetDateFilter
    ? { dateFrom: sp.dateFrom, dateTo: sp.dateTo, currency: sp.currency }
    : { currency: sp.currency };

  const cashFilters = {
    dateFrom: sp.dateFrom,
    dateTo: sp.dateTo,
    period,
    currency: sp.currency,
  };

  let cashReport;
  let projection;
  try {
    [cashReport, projection] = await Promise.all([
      getProjectCashFlowReport(projectId, cashFilters, ctx),
      getProjectCashProjectionReport(projectId, projectionFilters, ctx),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect(`/proyectos/${projectId}`);
    throw err;
  }

  const cashExclusions = cashReport.warnings.sectionsExcluded ?? [];
  const inflowsAvailable = !cashExclusions.some((entry) => entry.module === "AR");
  const outflowsAvailable = !cashExclusions.some((entry) => entry.module === "AP");
  const projectionInflowsAvailable = !projection.sectionsExcluded.some((entry) => entry.module === "AR");
  const projectionOutflowsAvailable = !projection.sectionsExcluded.some((entry) => entry.module === "AP");

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        title="Caja — real y proyección"
        actions={cashReport.currencies.length > 0 ? (
          <ReportExportActions
            exportPath={`/api/reports/proyectos/${projectId}/flujo-caja.csv`}
            params={sp}
            pdfOnly
            label="Exportar flujo real (PDF)"
          />
        ) : undefined}
      />

      <ReportSubnav>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${projectId}/reportes`}>← Reportes</Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${projectId}/flujo-caja`}>Flujo de caja (detalle)</Link>
        </Button>
        {outflowsAvailable ? (
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/proyectos/${projectId}/cuentas-por-pagar`}>Cuentas por pagar</Link>
          </Button>
        ) : null}
      </ReportSubnav>

      {projection.warnings.map((w, i) => (
        <p key={i} className="text-xs text-muted-foreground rounded-lg border p-3 bg-muted/30">
          {w}
        </p>
      ))}
      {cashExclusions.length > 0 ? (
        <p className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
          Flujo real parcial. Los saldos incluyen los movimientos disponibles.
        </p>
      ) : null}

      <div className="rounded-lg border bg-card p-4">
        <Suspense>
          <ProjectCashFlowFilters
            appliedDateFrom={cashReport.dateFrom}
            appliedDateTo={cashReport.dateTo}
            appliedPeriod={cashReport.period}
          />
        </Suspense>
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Flujo de caja real</h2>
        {cashReport.currencies.length > 0 ? cashReport.currencies.map((cashCur) => (
          <div key={cashCur.currency} className="space-y-3">
            <h3 className="text-xs font-medium">{cashCur.currency}</h3>
            <KpiStatGrid title={null} columns={3}>
              <KpiStatCard
                compact
                label="Ingresos (caja)"
                value={inflowsAvailable ? formatMoneyAmount(cashCur.totalInflows, cashCur.currency) : "—"}
                tone="success"
              />
              <KpiStatCard
                compact
                label="Egresos (caja)"
                value={outflowsAvailable ? formatMoneyAmount(cashCur.totalOutflows, cashCur.currency) : "—"}
                tone="danger"
              />
              <KpiStatCard
                compact
                label={cashExclusions.length > 0 ? "Saldo visible" : "Neto"}
                value={formatMoneyAmount(cashCur.netCashFlow, cashCur.currency)}
              />
            </KpiStatGrid>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Evolución por período</CardTitle>
              </CardHeader>
              <CardContent>
                <ProjectCashFlowChart
                  periods={cashCur.periods}
                  currency={cashCur.currency}
                  variant="bars"
                  inflowsAvailable={inflowsAvailable}
                  outflowsAvailable={outflowsAvailable}
                />
              </CardContent>
            </Card>
          </div>
        )) : (
          <p className="text-sm text-muted-foreground">Sin movimientos de caja en el rango.</p>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Proyección de liquidez</h2>
        <p className="text-xs text-muted-foreground">
          Horizonte: {formatDateRange(projection.dateFrom, projection.dateTo)}
        </p>
        {projection.currencies.length > 0 ? projection.currencies.map((projCur) => (
          <div key={projCur.currency} className="space-y-3">
            <h3 className="text-xs font-medium">{projCur.currency}</h3>
            <KpiStatGrid title={null} columns={3}>
              <KpiStatCard
                compact
                label="Cobros esperados"
                value={projectionInflowsAvailable ? formatMoneyAmount(projCur.totalExpectedInflows, projCur.currency) : "—"}
                tone="success"
              />
              <KpiStatCard
                compact
                label="Pagos esperados"
                value={projectionOutflowsAvailable ? formatMoneyAmount(projCur.totalExpectedOutflows, projCur.currency) : "—"}
                tone="danger"
              />
              <KpiStatCard
                compact
                label={projection.sectionsExcluded.length > 0 ? "Saldo esperado visible" : "Neto esperado"}
                value={formatMoneyAmount(projCur.netExpected, projCur.currency)}
              />
            </KpiStatGrid>
            <CashProjectionChart
              buckets={projCur.buckets}
              currency={projCur.currency}
              inflowsAvailable={projectionInflowsAvailable}
              outflowsAvailable={projectionOutflowsAvailable}
            />
            <p className="text-xs text-muted-foreground">
              {[
                projectionInflowsAvailable ? `${projCur.receivableOpenCount} por cobrar` : null,
                projectionOutflowsAvailable ? `${projCur.payableOpenCount} por pagar` : null,
              ].filter(Boolean).join(" · ")} con saldo en el horizonte.
            </p>
          </div>
        )) : (
          <CashProjectionChart buckets={[]} currency="ARS" />
        )}
      </section>
    </PageShell>
  );
}
