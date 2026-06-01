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
import { ReportExportActions } from "@/features/reports";
import { ProjectCashFlowChart, ProjectCashFlowFilters } from "@/features/project-cash-flow";
import { PageShell } from "@/components/layout/page-shell";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiStatCard } from "@/components/ui/kpi-stat-card";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";
import { formatMoneyAmount } from "@/lib/format-money";

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

  let project;
  try {
    project = await getProjectShellInfo(projectId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
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

  const projCur = projection.currencies.find((c) => c.currency === "ARS") ?? projection.currencies[0];
  const cashCur = cashReport.currencies.find((c) => c.currency === "ARS") ?? cashReport.currencies[0];

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        projectId={projectId}
        projectName={project.name}
        title="Caja — real y proyección"
        subtitle="R-005 flujo de caja confirmado · R-006 cobros/pagos esperados por vencimiento"
        actions={
          <ReportExportActions
            exportPath={`/api/reports/proyectos/${projectId}/flujo-caja.csv`}
            params={sp}
            pdfOnly
          />
        }
      />

      <div className="flex flex-wrap gap-2 text-sm">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${projectId}/reportes`}>← Reportes</Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${projectId}/flujo-caja`}>Flujo de caja (detalle)</Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${projectId}/cuentas-por-pagar`}>Cuentas por pagar</Link>
        </Button>
      </div>

      {projection.warnings.map((w, i) => (
        <p key={i} className="text-xs text-muted-foreground rounded-lg border p-3 bg-muted/30">
          {w}
        </p>
      ))}

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
        <h2 className="text-sm font-semibold">Flujo de caja real (R-005)</h2>
        {cashCur ? (
          <>
            <KpiStatGrid title={null} columns={3}>
              <KpiStatCard
                label="Ingresos (caja)"
                value={formatMoneyAmount(cashCur.totalInflows, cashCur.currency)}
                tone="success"
              />
              <KpiStatCard
                label="Egresos (caja)"
                value={formatMoneyAmount(cashCur.totalOutflows, cashCur.currency)}
                tone="danger"
              />
              <KpiStatCard
                label="Neto"
                value={formatMoneyAmount(cashCur.netCashFlow, cashCur.currency)}
              />
            </KpiStatGrid>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Evolución por período</CardTitle>
                <CardDescription>
                  {cashReport.dateFrom} → {cashReport.dateTo} · solo movimientos confirmados
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ProjectCashFlowChart periods={cashCur.periods} currency={cashCur.currency} variant="bars" />
              </CardContent>
            </Card>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Sin movimientos de caja en el rango.</p>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Proyección de liquidez (R-006)</h2>
        <p className="text-xs text-muted-foreground">
          Horizonte: {projection.dateFrom} → {projection.dateTo}
        </p>
        {projCur ? (
          <>
            <KpiStatGrid title={null} columns={3}>
              <KpiStatCard
                label="Cobros esperados"
                value={formatMoneyAmount(projCur.totalExpectedInflows, projCur.currency)}
                tone="success"
              />
              <KpiStatCard
                label="Pagos esperados"
                value={formatMoneyAmount(projCur.totalExpectedOutflows, projCur.currency)}
                tone="danger"
              />
              <KpiStatCard
                label="Neto esperado"
                value={formatMoneyAmount(projCur.netExpected, projCur.currency)}
              />
            </KpiStatGrid>
            <CashProjectionChart buckets={projCur.buckets} currency={projCur.currency} />
            <p className="text-xs text-muted-foreground">
              {projCur.receivableOpenCount} cuenta(s) por cobrar y {projCur.payableOpenCount} por pagar con saldo
              en el horizonte.
            </p>
          </>
        ) : (
          <CashProjectionChart buckets={[]} currency="ARS" />
        )}
      </section>
    </PageShell>
  );
}
