import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getProjectShellInfo, getProjectSupplierReport, parseProjectSupplierReportFilters, ServiceError } from "@bloqer/services";
import {
  ProjectSupplierLeaders,
  ProjectSupplierTable,
  ReportDateFilters,
  ReportExportActions,
  ReportSubnav,
} from "@/features/reports";
import { PageShell } from "@/components/layout/page-shell";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiStatCard } from "@/components/ui/kpi-stat-card";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";
import { formatMoneyAmount, isPositiveMoneyAmount } from "@/lib/format-money";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ dateFrom?: string; dateTo?: string; currency?: string }>;
}

export default async function ReporteProveedoresProyectoPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id: projectId } = await params;
  const sp = await searchParams;
  const filters = parseProjectSupplierReportFilters(sp);

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
    throw err;
  }

  let report;
  try {
    report = await getProjectSupplierReport(projectId, filters, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    if (err instanceof ServiceError && err.code === "VALIDATION") {
      return (
        <PageShell variant="default" className="space-y-6">
          <ProjectPageHeader title="Proveedores" />
          <ReportDateFilters showBudget={false} />
          <p role="alert" className="rounded-lg border bg-card p-4 text-sm">{err.message}</p>
        </PageShell>
      );
    }
    throw err;
  }

  const { totals, currency, apAvailable } = report;

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        title="Proveedores"
        subtitle={`Pedidos y gasto de proveedores en ${currency}. Capas de costo y exposición.`}
        actions={
          <ReportExportActions
            exportPath={`/api/reports/proyectos/${projectId}/proveedores.csv`}
            params={{ ...filters, currency }}
            pdf
          />
        }
      />

      <ReportSubnav>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${projectId}/reportes`}>← Reportes</Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${projectId}/reportes/compras-proveedores`}>Análisis de compras</Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${projectId}/ordenes-compra`}>Órdenes de compra</Link>
        </Button>
        {apAvailable ? (
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/proyectos/${projectId}/cuentas-por-pagar`}>Cuentas por pagar</Link>
          </Button>
        ) : null}
      </ReportSubnav>

      <ReportDateFilters
        showBudget={false}
        currencies={[...new Set([currency, ...report.availableCurrencies])]}
        currentCurrency={currency}
      />

      {report.warnings.length > 0 ? (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 dark:bg-yellow-950/20">
          {report.warnings.map((w) => (
            <p key={w} className="text-xs text-yellow-700 dark:text-yellow-400">
              {w}
            </p>
          ))}
        </div>
      ) : null}

      <KpiStatGrid title="Resumen" columns={3}>
        <KpiStatCard
          label="Proveedores"
          value={String(totals.supplierCount)}
          helper={apAvailable ? `${totals.poCount} pedidos · ${totals.invoiceCount} facturas` : `${totals.poCount} pedidos`}
        />
        <KpiStatCard
          label="Comprometido"
          value={formatMoneyAmount(totals.committedCost, currency)}
          helper={totals.avgPoAmount ? `Ticket medio ${formatMoneyAmount(totals.avgPoAmount, currency)}` : "Sin OC confirmadas"}
        />
        <KpiStatCard
          label="Exposición"
          value={apAvailable ? formatMoneyAmount(totals.expectedExposure, currency) : "—"}
          helper={apAvailable ? `Devengado ${formatMoneyAmount(totals.accruedCost, currency)} · OC abierta ${formatMoneyAmount(totals.openCommitted, currency)}` : "Facturas no disponibles"}
        />
        <KpiStatCard
          label="Pagado"
          value={apAvailable ? formatMoneyAmount(totals.paidCost, currency) : "—"}
        />
        <KpiStatCard
          label="Saldo CxP"
          value={apAvailable ? formatMoneyAmount(totals.payableBalance, currency) : "—"}
          helper={
            !apAvailable ? undefined : isPositiveMoneyAmount(totals.overduePayable)
              ? `Vencido ${formatMoneyAmount(totals.overduePayable, currency)}`
              : "Snapshot de hoy (no filtra por fechas)"
          }
          tone={isPositiveMoneyAmount(totals.overduePayable) ? "warning" : "default"}
        />
        <KpiStatCard
          label="Concentración top 3"
          value={apAvailable && totals.top3SharePct ? `${totals.top3SharePct}%` : "—"}
          helper={
            apAvailable && totals.top1SharePct
              ? `El primero concentra ${totals.top1SharePct}% de la exposición`
              : "Sin exposición para calcular"
          }
        />
      </KpiStatGrid>

      <div className="grid gap-4 lg:grid-cols-3">
        {apAvailable ? <ProjectSupplierLeaders kind="amount" rows={report.leadersByAmount} currency={currency} /> : null}
        <ProjectSupplierLeaders kind="orders" rows={report.leadersByOrders} currency={currency} />
        {apAvailable ? <ProjectSupplierLeaders kind="payable" rows={report.leadersByPayable} currency={currency} /> : null}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Por proveedor</CardTitle>
          <p className="text-xs text-muted-foreground">
            Exposición = devengado + comprometido abierto. El % es sobre la exposición de la obra. Subcontratos
            certificados viven en el reporte de subcontratos.
          </p>
        </CardHeader>
        <CardContent>
          <ProjectSupplierTable rows={report.rows} currency={currency} apAvailable={apAvailable} />
        </CardContent>
      </Card>
    </PageShell>
  );
}
