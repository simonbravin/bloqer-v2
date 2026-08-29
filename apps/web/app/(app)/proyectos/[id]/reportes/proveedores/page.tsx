import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getProjectShellInfo, getProjectSupplierReport, ServiceError } from "@bloqer/services";
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
  searchParams: Promise<{ dateFrom?: string; dateTo?: string }>;
}

export default async function ReporteProveedoresProyectoPage({ params, searchParams }: PageProps) {
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
    throw err;
  }

  let report;
  try {
    report = await getProjectSupplierReport(projectId, { dateFrom: sp.dateFrom, dateTo: sp.dateTo }, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  const { totals } = report;

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        title="Proveedores"
        subtitle="Quién concentra pedidos y gasto en la obra. Capas canónicas: comprometido, devengado, pagado y exposición."
        actions={
          <ReportExportActions
            exportPath={`/api/reports/proyectos/${projectId}/proveedores.csv`}
            params={sp}
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
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${projectId}/cuentas-por-pagar`}>Cuentas por pagar</Link>
        </Button>
      </ReportSubnav>

      <ReportDateFilters showBudget={false} />

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
          helper={`${totals.poCount} pedidos · ${totals.invoiceCount} facturas`}
        />
        <KpiStatCard
          label="Comprometido"
          value={formatMoneyAmount(totals.committedCost)}
          helper={totals.avgPoAmount ? `Ticket medio ${formatMoneyAmount(totals.avgPoAmount)}` : "Sin OC confirmadas"}
        />
        <KpiStatCard
          label="Exposición"
          value={formatMoneyAmount(totals.expectedExposure)}
          helper={`Devengado ${formatMoneyAmount(totals.accruedCost)} · OC abierta ${formatMoneyAmount(totals.openCommitted)}`}
        />
        <KpiStatCard
          label="Pagado"
          value={formatMoneyAmount(totals.paidCost)}
          helper="Caja confirmada contra facturas de proveedor"
        />
        <KpiStatCard
          label="Saldo CxP"
          value={formatMoneyAmount(totals.payableBalance)}
          helper={
            isPositiveMoneyAmount(totals.overduePayable)
              ? `Vencido ${formatMoneyAmount(totals.overduePayable)}`
              : "Snapshot de hoy (no filtra por fechas)"
          }
          tone={isPositiveMoneyAmount(totals.overduePayable) ? "warning" : "default"}
        />
        <KpiStatCard
          label="Concentración top 3"
          value={totals.top3SharePct ? `${totals.top3SharePct}%` : "—"}
          helper={
            totals.top1SharePct
              ? `El primero concentra ${totals.top1SharePct}% de la exposición`
              : "Sin exposición para calcular"
          }
        />
      </KpiStatGrid>

      <div className="grid gap-4 lg:grid-cols-3">
        <ProjectSupplierLeaders kind="amount" rows={report.leadersByAmount} />
        <ProjectSupplierLeaders kind="orders" rows={report.leadersByOrders} />
        <ProjectSupplierLeaders kind="payable" rows={report.leadersByPayable} />
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
          <ProjectSupplierTable rows={report.rows} />
        </CardContent>
      </Card>
    </PageShell>
  );
}
