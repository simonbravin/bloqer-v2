import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getProjectCostControl,
  getProjectProfitabilityReport,
  getProjectShellInfo,
  parseCostVarianceLayer,
  parseCurrencyView,
  ServiceError,
} from "@bloqer/services";
import { ProfitabilityFilters, ProfitabilitySummary, ReportExportActions } from "@/features/reports";
import { PageShell } from "@/components/layout/page-shell";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { Button } from "@/components/ui/button";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    budgetId?: string;
    costLayer?: string;
    revenueBasis?: string;
    currencyView?: string;
  }>;
}

export default async function ReporteRentabilidadPage({ params, searchParams }: PageProps) {
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

  const filters = {
    budgetId: sp.budgetId,
    costLayer: parseCostVarianceLayer(sp.costLayer),
    revenueBasis: sp.revenueBasis === "invoiced" ? ("invoiced" as const) : ("certified" as const),
    currencyView: parseCurrencyView(sp.currencyView),
  };

  let report;
  let budgetProbe;
  try {
    [report, budgetProbe] = await Promise.all([
      getProjectProfitabilityReport(projectId, filters, ctx),
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
        title="Rentabilidad del proyecto"
        subtitle="R-003 margen bruto · R-004 margen neto (cuando aplique política GG)"
        actions={
          report.type === "REPORT" ? (
            <ReportExportActions
              exportPath={`/api/reports/proyectos/${projectId}/rentabilidad.csv`}
              params={sp}
              pdfOnly
            />
          ) : undefined
        }
      />

      <div className="flex flex-wrap gap-2 text-sm">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${projectId}/reportes`}>← Reportes</Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${projectId}/control-costos`}>Control de costos</Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${projectId}/reportes/ingresos-gastos`}>Ingresos vs gastos</Link>
        </Button>
      </div>

      <ProfitabilityFilters
        budgets={availableBudgets}
        currentBudgetId={sp.budgetId}
        currentCostLayer={sp.costLayer}
        currentRevenueBasis={sp.revenueBasis}
        currentCurrencyView={sp.currencyView}
      />

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
          <ProfitabilitySummary report={report} />
        </>
      )}
    </PageShell>
  );
}
