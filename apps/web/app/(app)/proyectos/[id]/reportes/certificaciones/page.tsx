import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getCertificationEvolutionReport,
  getProjectCostControl,
  getProjectShellInfo,
  ServiceError,
} from "@bloqer/services";
import {
  CertificationEvolutionChart,
  CertificationPortfolioTable,
  CertificationProgressChart,
  CertificationVsBudgetTable,
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

export default async function ReporteCertificacionesPage({ params, searchParams }: PageProps) {
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
      getCertificationEvolutionReport(projectId, filters, ctx),
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
        title="Certificaciones — evolución y estado"
        subtitle={
          report.type === "REPORT"
            ? `${report.budgetName} · venta presup. ${parseFloat(report.budgetTotalSale).toLocaleString("es-AR")}`
            : undefined
        }
        actions={
          report.type === "REPORT" ? (
            <ReportCsvExportLink
              exportPath={`/api/reports/proyectos/${projectId}/certificaciones.csv`}
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
          <Link href={`/proyectos/${projectId}/certificaciones`}>Ir a certificaciones</Link>
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

          <div className="grid gap-6 lg:grid-cols-2">
            <CertificationEvolutionChart series={report.monthlySeries} />
            <CertificationProgressChart series={report.progressSeries} />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Estado de certificaciones</CardTitle>
              <CardDescription>Certificado, facturado y cobrado por documento</CardDescription>
            </CardHeader>
            <CardContent>
              <CertificationPortfolioTable rows={report.portfolio} projectId={projectId} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Certificado vs venta presupuestada</CardTitle>
              <CardDescription>Por partida WBS · pendientes: {report.pendingCount}</CardDescription>
            </CardHeader>
            <CardContent>
              <CertificationVsBudgetTable rows={report.vsBudget} />
            </CardContent>
          </Card>
        </>
      )}
    </PageShell>
  );
}
