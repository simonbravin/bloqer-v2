import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getProjectCostControl,
  getProjectShellInfo,
  getSubcontractVarianceReport,
  ServiceError,
} from "@bloqer/services";
import {
  ReportDateFilters,
  ReportExportActions,
  SubcontractCertChart,
  SubcontractContractsTable,
  SubcontractWbsVarianceTable,
} from "@/features/reports";
import { PageShell } from "@/components/layout/page-shell";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ budgetId?: string; dateFrom?: string; dateTo?: string }>;
}

export default async function ReporteSubcontratosPage({ params, searchParams }: PageProps) {
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
      getSubcontractVarianceReport(projectId, filters, ctx),
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
        title="Subcontratos — varianza y certificaciones"
        subtitle={
          report.type === "REPORT"
            ? `${report.budgetName} · ${report.pendingContractCount} partida(s) sin contrato · ${report.withoutBaselineCount} sin baseline`
            : undefined
        }
        actions={
          report.type === "REPORT" ? (
            <div className="flex flex-wrap items-center gap-2">
              {report.pendingContractCount > 0 ? (
                <Button size="sm" asChild>
                  <Link href={`/proyectos/${projectId}/subcontratos/nuevo?filter=pending`}>
                    Crear contrato ({report.pendingContractCount})
                  </Link>
                </Button>
              ) : null}
              <ReportExportActions
                exportPath={`/api/reports/proyectos/${projectId}/subcontratos.csv`}
                params={sp}
                pdf
              />
            </div>
          ) : undefined
        }
      />

      <div className="flex flex-wrap gap-2 text-sm">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${projectId}/reportes`}>← Reportes</Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${projectId}/subcontratos`}>Ir a subcontratos</Link>
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

          <SubcontractCertChart series={report.monthlyCertification} />

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">SUB presupuestado vs contratado</CardTitle>
              <CardDescription>Por partida WBS · capa SUBCONTRACT del APU</CardDescription>
            </CardHeader>
            <CardContent>
              <SubcontractWbsVarianceTable rows={report.byWbs} projectId={projectId} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Contratos del proyecto</CardTitle>
              <CardDescription>Valor contractual y certificado acumulado</CardDescription>
            </CardHeader>
            <CardContent>
              <SubcontractContractsTable rows={report.contracts} projectId={projectId} />
            </CardContent>
          </Card>
        </>
      )}
    </PageShell>
  );
}
