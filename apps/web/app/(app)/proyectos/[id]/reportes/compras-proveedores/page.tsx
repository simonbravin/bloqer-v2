import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getProcurementDeviationReport,
  getPurchaseOrderVarianceReport,
  getProjectCostControl,
  getProjectShellInfo,
  ServiceError,
} from "@bloqer/services";
import {
  ProcurementSupplierTable,
  ProcurementUnallocatedTable,
  ProcurementWbsDeviationTable,
  PurchaseOrderVarianceTable,
  ReportDateFilters,
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
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  const filters = { budgetId: sp.budgetId, dateFrom: sp.dateFrom, dateTo: sp.dateTo };

  let report;
  let budgetProbe;
  let poVariance;
  try {
    [report, budgetProbe, poVariance] = await Promise.all([
      getProcurementDeviationReport(projectId, filters, ctx),
      getProjectCostControl(projectId, { budgetId: sp.budgetId }, ctx),
      getPurchaseOrderVarianceReport(projectId, ctx),
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
        title="Compras y proveedores"
        subtitle={
          report.type === "REPORT"
            ? `${report.budgetName} · desvíos de material vs OC y facturas`
            : undefined
        }
        actions={
          report.type === "REPORT" ? (
            <ReportExportActions
              exportPath={`/api/reports/proyectos/${projectId}/compras-proveedores.csv`}
              params={sp}
              pdf
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
            </CardHeader>
            <CardContent>
              <ProcurementWbsDeviationTable rows={report.byWbs} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Sin imputación WBS</CardTitle>
            </CardHeader>
            <CardContent>
              <ProcurementUnallocatedTable rows={report.unallocated} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Por proveedor</CardTitle>
            </CardHeader>
            <CardContent>
              <ProcurementSupplierTable rows={report.bySupplier} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Desvíos en líneas de OC</CardTitle>
            </CardHeader>
            <CardContent>
              <PurchaseOrderVarianceTable rows={poVariance.rows} projectId={projectId} />
            </CardContent>
          </Card>
        </>
      )}
    </PageShell>
  );
}
