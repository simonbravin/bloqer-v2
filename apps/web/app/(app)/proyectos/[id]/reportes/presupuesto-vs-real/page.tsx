import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getBudgetVarianceReport,
  getBudgetCompositionReport,
  getProjectShellInfo,
  parseCostVarianceLayer,
  ServiceError,
} from "@bloqer/services";
import {
  BudgetVarianceFilters,
  BudgetVarianceTable,
  BudgetCompositionChart,
} from "@/features/reports";
import { CostControlSummaryCards } from "@/features/cost-control";
import { ReportExportActions } from "@/features/reports";
import { PageShell } from "@/components/layout/page-shell";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { Button } from "@/components/ui/button";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    budgetId?: string;
    dateFrom?: string;
    dateTo?: string;
    wbsSearch?: string;
    costLayer?: string;
  }>;
}

export default async function PresupuestoVsRealPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id: projectId } = await params;
  const sp = await searchParams;
  const costLayer = parseCostVarianceLayer(sp.costLayer);

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
    dateFrom: sp.dateFrom,
    dateTo: sp.dateTo,
    wbsSearch: sp.wbsSearch,
    costLayer,
  };

  let varianceResult;
  let compositionResult;
  try {
    [varianceResult, compositionResult] = await Promise.all([
      getBudgetVarianceReport(projectId, filters, ctx),
      getBudgetCompositionReport(projectId, { budgetId: sp.budgetId }, ctx),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  const availableBudgets =
    varianceResult.type === "NO_APPROVED_BUDGETS" ? [] : varianceResult.availableBudgets;

  const exportParams = { ...sp, costLayer };

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        projectId={projectId}
        projectName={project.name}
        title="Presupuesto vs real"
        subtitle={
          varianceResult.type === "REPORT"
            ? `${varianceResult.budgetName} · capa: ${costLayer}`
            : undefined
        }
        actions={
          varianceResult.type === "REPORT" ? (
            <ReportExportActions
              exportPath={`/api/reports/proyectos/${projectId}/presupuesto-vs-real.csv`}
              params={exportParams}
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
          <Link href={`/proyectos/${projectId}/control-costos?${new URLSearchParams(sp as Record<string, string>).toString()}`}>
            Control de costos detallado
          </Link>
        </Button>
      </div>

      <BudgetVarianceFilters
        budgets={availableBudgets}
        currentBudgetId={sp.budgetId}
        currentLayer={costLayer}
      />

      {varianceResult.type === "NO_APPROVED_BUDGETS" ? (
        <div className="rounded-lg border bg-card p-8 text-center space-y-3">
          <p className="font-semibold">No hay presupuesto aprobado o cerrado</p>
          <p className="text-sm text-muted-foreground">
            Aprobá un presupuesto para comparar planificado vs ejecución por partida.
          </p>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/proyectos/${projectId}/presupuestos`}>Ir a presupuestos</Link>
          </Button>
        </div>
      ) : varianceResult.type === "BUDGET_SELECTION_REQUIRED" ? (
        <div className="rounded-lg border bg-card p-8 text-center space-y-3">
          <p className="font-semibold">Seleccioná un presupuesto</p>
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            {varianceResult.availableBudgets.map((b) => (
              <Link
                key={b.id}
                href={`/proyectos/${projectId}/reportes/presupuesto-vs-real?budgetId=${b.id}`}
                className="rounded-md border px-4 py-2 text-sm hover:bg-muted transition-colors"
              >
                {b.name} ({b.status})
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <>
          {varianceResult.warnings.length > 0 && (
            <div className="rounded-lg border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20 p-3 space-y-1">
              {varianceResult.warnings.map((w, i) => (
                <p key={i} className="text-xs text-yellow-700 dark:text-yellow-400">
                  {w}
                </p>
              ))}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-1">
              {compositionResult.type === "COMPOSITION" ? (
                <BudgetCompositionChart composition={compositionResult} />
              ) : null}
            </div>
            <div className="lg:col-span-2 space-y-4">
              <CostControlSummaryCards totals={varianceResult.totals} />
              {varianceResult.rows.length === 0 ? (
                <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground text-sm">
                  No hay partidas en este presupuesto
                  {sp.wbsSearch ? ` que coincidan con "${sp.wbsSearch}"` : ""}.
                </div>
              ) : (
                <BudgetVarianceTable report={varianceResult} projectId={projectId} />
              )}
            </div>
          </div>
        </>
      )}
    </PageShell>
  );
}
