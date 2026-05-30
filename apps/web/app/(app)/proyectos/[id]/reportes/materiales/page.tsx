import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getMaterialLinesWithoutProduct,
  getMaterialVarianceReport,
  getProjectCostControl,
  getProjectShellInfo,
  ServiceError,
} from "@bloqer/services";
import { MaterialWbsTable, ReportDateFilters, ReportExportActions } from "@/features/reports";
import { PageShell } from "@/components/layout/page-shell";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiStatCard } from "@/components/ui/kpi-stat-card";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";
import { formatMoneyAmount } from "@/lib/format-money";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ budgetId?: string; dateFrom?: string; dateTo?: string }>;
}

export default async function ReporteMaterialesPage({ params, searchParams }: PageProps) {
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
  let withoutProduct: Awaited<ReturnType<typeof getMaterialLinesWithoutProduct>> = [];
  try {
    [report, budgetProbe] = await Promise.all([
      getMaterialVarianceReport(projectId, filters, ctx),
      getProjectCostControl(projectId, { budgetId: sp.budgetId }, ctx),
    ]);
    if (report.type === "REPORT") {
      withoutProduct = await getMaterialLinesWithoutProduct(projectId, report.budgetId, ctx);
    }
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
        title="Materiales — consumo vs presupuesto"
        subtitle="R-MAT-01 consumo de stock · R-MAT-02 APU sin producto"
        actions={
          report.type === "REPORT" ? (
            <ReportExportActions
              exportPath={`/api/reports/proyectos/${projectId}/materiales.csv`}
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
          <Link href={`/proyectos/${projectId}/reportes/compras-proveedores`}>
            Compras y proveedores
          </Link>
        </Button>
      </div>

      <ReportDateFilters budgets={availableBudgets} currentBudgetId={sp.budgetId} />

      {report.type === "NO_APPROVED_BUDGETS" ? (
        <div className="rounded-lg border bg-card p-8 text-center space-y-3">
          <p className="font-semibold">No hay presupuesto aprobado o cerrado</p>
        </div>
      ) : (
        <>
          {report.warnings.map((w, i) => (
            <p key={i} className="text-xs text-yellow-700 dark:text-yellow-400">
              {w}
            </p>
          ))}

          <KpiStatGrid title={null} columns={3}>
            <KpiStatCard
              label="Presupuesto material"
              value={formatMoneyAmount(report.totals.budgetMaterial, "ARS")}
            />
            <KpiStatCard
              label="Consumo devengado"
              value={formatMoneyAmount(report.totals.consumedCost, "ARS")}
            />
            <KpiStatCard
              label="Variación"
              value={formatMoneyAmount(report.totals.variance, "ARS")}
            />
          </KpiStatGrid>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Por partida WBS</CardTitle>
              <CardDescription>Baseline MATERIAL del APU vs consumos de inventario</CardDescription>
            </CardHeader>
            <CardContent>
              <MaterialWbsTable rows={report.byWbs} />
            </CardContent>
          </Card>

          {withoutProduct && withoutProduct.length > 0 ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">APU material sin producto (R-MAT-02)</CardTitle>
                <CardDescription>
                  {withoutProduct.length} línea(s) MATERIAL sin vínculo a catálogo de productos
                </CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                {withoutProduct.slice(0, 20).map((l) => (
                  <p key={l.costAnalysisLineId}>
                    <span className="font-mono">{l.wbsCode}</span> — {l.description} ({l.totalCost})
                  </p>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </PageShell>
  );
}
