import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getProcurementDeviationReport,
  getPurchaseOrderVarianceReport,
  listApprovedBudgetsForProject,
  getProjectShellInfo,
  ServiceError,
} from "@bloqer/services";
import {
  ProcurementSupplierTable,
  ProcurementUnallocatedTable,
  PurchaseOrderVarianceTable,
  ReportDateFilters,
  ReportSubnav,
} from "@/features/reports";
import { ReportExportActions } from "@/features/reports";
import { PageShell } from "@/components/layout/page-shell";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ budgetId?: string; dateFrom?: string; dateTo?: string }>;
}

export default async function ReporteComprasProveedoresPage({ params, searchParams }: PageProps) {
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

  const filters = { budgetId: sp.budgetId, dateFrom: sp.dateFrom, dateTo: sp.dateTo };

  let availableBudgets: Awaited<ReturnType<typeof listApprovedBudgetsForProject>> = [];
  const [costRead, historyRead] = await Promise.allSettled([
    (async () => {
      availableBudgets = await listApprovedBudgetsForProject(projectId, ctx);
      return getProcurementDeviationReport(projectId, filters, ctx);
    })(),
    getPurchaseOrderVarianceReport(projectId, ctx, filters),
  ]);

  const report = costRead.status === "fulfilled" ? costRead.value : null;
  const poVariance = historyRead.status === "fulfilled" ? historyRead.value : null;
  let filterError: string | null = null;
  if (historyRead.status === "rejected") {
    const error = historyRead.reason;
    if (error instanceof ServiceError && error.code === "FORBIDDEN") redirect("/dashboard");
    if (!(error instanceof ServiceError && error.code === "VALIDATION")) throw error;
    filterError = error.message;
  }
  if (costRead.status === "rejected") {
    const error = costRead.reason;
    if (!(error instanceof ServiceError) || !["VALIDATION", "CONFLICT", "FORBIDDEN"].includes(error.code)) {
      throw error;
    }
    filterError = error.message;
  }

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        title="Análisis de compras"
        subtitle={
          report?.type === "REPORT"
            ? `${report.budgetName} · ${report.currency} · Proveedores y desvíos de líneas de OC frente al APU.`
            : "Proveedores y desvíos de líneas de OC frente al APU."
        }
        actions={
          report?.type === "REPORT" && poVariance ? (
            <ReportExportActions
              exportPath={`/api/reports/proyectos/${projectId}/compras-proveedores.csv`}
              params={{ ...filters, budgetId: report.budgetId }}
              pdf
            />
          ) : undefined
        }
      />

      <ReportSubnav>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${projectId}/reportes`}>← Reportes</Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${projectId}/control-costos`}>EDT y costos</Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${projectId}/materiales`}>Materiales</Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${projectId}/reportes/proveedores`}>Proveedores</Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${projectId}/ordenes-compra`}>Órdenes de compra</Link>
        </Button>
        {report?.type === "REPORT" && report.apAvailable ? (
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/proyectos/${projectId}/cuentas-por-pagar`}>Cuentas por pagar</Link>
          </Button>
        ) : null}
      </ReportSubnav>

      <ReportDateFilters budgets={availableBudgets} currentBudgetId={report?.type === "REPORT" ? report.budgetId : filters.budgetId} />

      {!report || filterError ? (
        <p role="alert" className="rounded-lg border bg-card p-4 text-sm">
          {filterError ?? "El análisis de costos no está disponible."}
        </p>
      ) : report.type === "NO_APPROVED_BUDGETS" ? (
        <div className="rounded-lg border bg-card p-8 text-center space-y-3">
          <p className="font-semibold">No hay presupuesto aprobado o cerrado</p>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/proyectos/${projectId}/presupuestos`}>Ir a presupuestos</Link>
          </Button>
        </div>
      ) : (
        <>
          {report.warnings.length > 0 && (
            <div className="rounded-lg border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20 p-3 space-y-1">
              {report.warnings.map((w, i) => (
                <p key={i} className="text-xs text-yellow-700 dark:text-yellow-400">
                  {w}
                </p>
              ))}
            </div>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Sin imputación EDT</CardTitle>
              <p className="text-xs text-muted-foreground">
                Compras que no vinieron con partida asignada. Corregilas para que aparezcan en EDT y costos.
              </p>
            </CardHeader>
            <CardContent>
              <ProcurementUnallocatedTable rows={report.unallocated} currency={report.currency} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Por proveedor</CardTitle>
              <p className="text-xs text-muted-foreground">
                Qué le comprás a cada proveedor (OC confirmadas + facturas). El ranking, % de obra y saldo CxP están
                en el{" "}
                <Link href={`/proyectos/${projectId}/reportes/proveedores`} className="underline underline-offset-2">
                  reporte de proveedores
                </Link>
                .
              </p>
            </CardHeader>
            <CardContent>
              <ProcurementSupplierTable rows={report.bySupplier} apAvailable={report.apAvailable} currency={report.currency} />
            </CardContent>
          </Card>
        </>
      )}
      {poVariance && (poVariance.rows.length > 0 || report?.type === "REPORT") ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Desvíos en líneas de OC</CardTitle>
            <p className="text-xs text-muted-foreground">
              Cada línea muestra la moneda de la OC y su referencia APU histórica. El período usa la fecha de emisión.
            </p>
          </CardHeader>
          <CardContent>
            <PurchaseOrderVarianceTable rows={poVariance.rows} projectId={projectId} />
          </CardContent>
        </Card>
      ) : null}
    </PageShell>
  );
}
