import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getProcurementDeviationReport,
  getProjectCostControl,
  getProjectShellInfo,
  ServiceError,
} from "@bloqer/services";
import {
  ProcurementSupplierTable,
  ProcurementUnallocatedTable,
  ProcurementWbsDeviationTable,
  ReportDateFilters,
} from "@/features/reports";
import { ReportCsvExportLink } from "@/features/reports/report-csv-export-link";
import { PageShell } from "@/components/layout/page-shell";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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

  let project;
  try {
    project = await getProjectShellInfo(projectId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  const filters = { budgetId: sp.budgetId, dateFrom: sp.dateFrom, dateTo: sp.dateTo };

  let report;
  let budgetProbe;
  try {
    [report, budgetProbe] = await Promise.all([
      getProcurementDeviationReport(projectId, filters, ctx),
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
        projectId={projectId}
        projectName={project.name}
        title="Compras y proveedores"
        subtitle={
          report.type === "REPORT"
            ? `${report.budgetName} · desvíos de material vs OC y facturas`
            : undefined
        }
        actions={
          report.type === "REPORT" ? (
            <ReportCsvExportLink
              exportPath={`/api/reports/proyectos/${projectId}/compras-proveedores.csv`}
              params={sp}
            />
          ) : undefined
        }
      />

      <div className="flex flex-wrap gap-2 text-sm">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${projectId}/reportes`}>← Reportes</Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${projectId}/ordenes-compra`}>Órdenes de compra</Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${projectId}/cuentas-por-pagar`}>Cuentas por pagar</Link>
        </Button>
      </div>

      <ReportDateFilters budgets={availableBudgets} currentBudgetId={sp.budgetId} />

      {report.type === "NO_APPROVED_BUDGETS" ? (
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
              <CardTitle className="text-base">Material presupuestado vs ejecución</CardTitle>
              <CardDescription>Por partida WBS · capa MATERIAL del APU</CardDescription>
            </CardHeader>
            <CardContent>
              <ProcurementWbsDeviationTable rows={report.byWbs} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Sin imputación WBS</CardTitle>
              <CardDescription>
                Líneas de OC o facturas sin partida asignada ({report.unallocated.length})
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ProcurementUnallocatedTable rows={report.unallocated} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Por proveedor</CardTitle>
              <CardDescription>Comprometido, devengado y pagado en el proyecto</CardDescription>
            </CardHeader>
            <CardContent>
              <ProcurementSupplierTable rows={report.bySupplier} />
            </CardContent>
          </Card>
        </>
      )}
    </PageShell>
  );
}
