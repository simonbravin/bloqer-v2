import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, ArrowUpRight, Info } from "lucide-react";
import {
  canManageScheduledReports,
  getProjectProgressReport,
  getProjectShellInfo,
  parseProjectProgressFilters,
  ServiceError,
} from "@bloqer/services";
import { toIsoDateInTimeZone } from "@bloqer/utils";
import { PageShell } from "@/components/layout/page-shell";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectProgressCharts } from "@/features/project-progress/project-progress-charts";
import {
  ProjectProgressDetail,
  ProjectProgressPending,
} from "@/features/project-progress/project-progress-detail";
import { ProjectProgressFilters } from "@/features/project-progress/project-progress-filters";
import { ProjectProgressSummary } from "@/features/project-progress/project-progress-summary";
import { ReportExportActions } from "@/features/reports/report-export-actions";
import { ReportEmailSendDialog } from "@/features/reports/report-email-send-dialog";
import { ReportSubnav } from "@/features/reports/report-subnav";
import { getCurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { formatMoneyDisplay } from "@/lib/format-money";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ReporteAvancesPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  const { id: projectId } = await params;
  const sp = await searchParams;
  const queryParams = Object.fromEntries(
    Object.entries(sp).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };
  const base = `/proyectos/${projectId}`;

  try {
    await getProjectShellInfo(projectId, ctx);
  } catch (error) {
    if (error instanceof ServiceError && (error.code === "NOT_FOUND" || error.code === "FORBIDDEN"))
      notFound();
    throw error;
  }

  let report;
  try {
    report = await getProjectProgressReport(
      projectId,
      parseProjectProgressFilters(queryParams),
      ctx,
    );
  } catch (error) {
    if (error instanceof ServiceError && error.code === "NOT_FOUND") notFound();
    if (error instanceof ServiceError && error.code === "FORBIDDEN") redirect("/dashboard");
    if (error instanceof ServiceError && error.code === "VALIDATION") {
      return (
        <PageShell className="space-y-6">
          <ProjectPageHeader title="Avances del proyecto" />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Revisá los filtros del reporte</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{error.message}</p>
              <Button variant="outline" asChild>
                <Link href={`${base}/reportes/avances`}>Restablecer filtros</Link>
              </Button>
            </CardContent>
          </Card>
        </PageShell>
      );
    }
    throw error;
  }

  if (report.type === "NO_APPROVED_BUDGETS") {
    return (
      <PageShell className="space-y-6">
        <ProjectPageHeader
          title="Avances del proyecto"
          subtitle="Ejecución, certificación y costos en una misma vista."
        />
        <ReportSubnav>
          <Button variant="ghost" size="sm" asChild>
            <Link href={`${base}/reportes`}>← Reportes</Link>
          </Button>
        </ReportSubnav>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No hay presupuesto aprobado o cerrado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              El reporte necesita una base contractual para comparar lo planificado, lo ejecutado y
              lo certificado.
            </p>
            <Button variant="outline" asChild>
              <Link href={`${base}/presupuestos`}>Ir a presupuestos</Link>
            </Button>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  const selectedBudgetId = queryParams.budgetId;
  const exportParams = {
    dateFrom: report.dateFrom,
    dateTo: report.dateTo,
    currency: report.currency,
    budgetId: selectedBudgetId,
  };
  const periodStart = formatDate(`${report.dateFrom}T12:00:00.000Z`);
  const cutoff = formatDate(`${report.dateTo}T12:00:00.000Z`);
  const scopeKey = `${report.dateFrom}:${report.dateTo}:${report.currency}:${selectedBudgetId ?? "all"}`;

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        title="Avances del proyecto"
        subtitle="Qué se ejecutó, qué se certificó y qué necesita atención."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ReportExportActions
              exportPath={`/api/reports/proyectos/${projectId}/avances.csv`}
              params={exportParams}
              pdf
              xlsx
            />
            <ReportEmailSendDialog
              reportType="PROJECT_PROGRESS"
              supportsPdf
              params={exportParams}
              projectId={projectId}
              defaultRecipientEmail={current.session.user?.email ?? null}
            />
          </div>
        }
      />
      <ReportSubnav>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`${base}/reportes`}>← Reportes</Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`${base}/cronograma`}>Cronograma</Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href="#pendientes">Pendientes</Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href="#partidas">Detalle por partida</Link>
        </Button>
        {canManageScheduledReports(ctx) ? (
          <Button variant="ghost" size="sm" asChild>
            <Link href={`${base}/reportes/programados`}>Envíos programados</Link>
          </Button>
        ) : null}
      </ReportSubnav>

      <ProjectProgressFilters
        key={scopeKey}
        budgets={report.availableBudgets}
        currencies={report.availableCurrencies}
        budgetId={selectedBudgetId}
        currency={report.currency}
        dateFrom={report.dateFrom}
        dateTo={report.dateTo}
        maxDate={toIsoDateInTimeZone()}
      />

      <div className="flex flex-col gap-3 rounded-xl border border-indigo-500/20 bg-gradient-to-r from-indigo-500/5 via-sky-500/5 to-background p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Acumulado al {cutoff}
          </p>
          <h2 className="mt-1 text-base font-semibold">{report.budgetName}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {report.projectName} · {report.currency} · Evolución desde {periodStart}
          </p>
        </div>
        <span className="w-fit rounded-full border bg-background px-3 py-1 text-xs font-medium">
          {report.physical.totalCount} partidas en el alcance
        </span>
      </div>

      <ProjectProgressSummary report={report} />

      {report.warnings.length > 0 ? (
        <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            Calidad y alcance de la información
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
            {report.warnings.slice(0, 3).map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
          {report.warnings.length > 3 ? (
            <details className="mt-2 text-xs text-amber-800 dark:text-amber-300">
              <summary className="cursor-pointer font-medium">
                Ver {report.warnings.length - 3} avisos más
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-6 leading-relaxed">
                {report.warnings.slice(3).map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
      {report.sectionsExcluded.length > 0 ? (
        <details className="rounded-lg border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium">
            Información limitada por módulos o permisos · {report.sectionsExcluded.length} fuentes
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            {report.sectionsExcluded.map((section, index) => (
              <li key={index}>{section}</li>
            ))}
          </ul>
        </details>
      ) : null}

      <ProjectProgressCharts report={report} />
      <ProjectProgressPending key={scopeKey} report={report} />
      <ProjectProgressDetail key={scopeKey} report={report} />

      <details className="rounded-xl border bg-card p-4">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <Info className="h-4 w-4 text-muted-foreground" aria-hidden />
          Cómo leer este reporte
        </summary>
        <div className="mt-4 space-y-4 text-xs leading-relaxed text-muted-foreground">
          <ul className="list-disc space-y-2 pl-4">
            {report.notes.map((note, index) => (
              <li key={index}>{note}</li>
            ))}
          </ul>
          <p>
            El real y los pendientes del cronograma reflejan la situación actual del proyecto
            completo, y pueden incluir ajustes manuales. Se muestran separados de la ejecución del
            libro aprobado.
          </p>
          <p>
            <strong className="text-foreground">Saldo previo a {periodStart}.</strong> Certificado:{" "}
            {formatMoneyDisplay(report.opening.certified, report.currency)} · Facturado:{" "}
            {formatMoneyDisplay(report.opening.invoiced, report.currency)} · Cobrado:{" "}
            {formatMoneyDisplay(report.opening.collected, report.currency)} · Costo devengado:{" "}
            {formatMoneyDisplay(report.opening.costAccrued, report.currency)}.
          </p>
        </div>
        <Link
          href="/ayuda/reporte-avances-del-proyecto"
          className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Ver ayuda del reporte <ArrowUpRight className="h-3 w-3" aria-hidden />
        </Link>
      </details>
    </PageShell>
  );
}
