import Link from "next/link";
import { formatDate } from "@/lib/format";
import type { ProjectStatus } from "@bloqer/database";
import type { ProjectOverviewDashboard } from "@bloqer/services";
import type { ProjectWithClient } from "@bloqer/services";
import { ProjectStatusBadge } from "@/features/projects";
import { DashboardKpiCard } from "@/features/dashboard/dashboard-kpi-card";
import { ProjectOverviewActivityCard } from "./project-overview-activity-card";
import { ProjectOverviewAlerts } from "./project-overview-alerts";
import { ProjectOverviewCharts } from "./project-overview-charts";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const TYPE_LABELS = { PUBLIC: "Público", PRIVATE: "Privado" } as const;

function locDate(d: Date | null | undefined) {
  if (!d) return "—";
  return formatDate(d);
}

function projectAddress(project: ProjectWithClient): string {
  return [project.address, project.city, project.province].filter(Boolean).join(", ");
}

function MetaItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium">{children}</dd>
    </div>
  );
}

export function ProjectOverviewView({
  dashboard,
  projectId,
  fullProject,
  lifecycleActions,
}: {
  dashboard: ProjectOverviewDashboard;
  projectId: string;
  fullProject: ProjectWithClient | null;
  lifecycleActions: React.ReactNode;
}) {
  const p = dashboard.project;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-bold tracking-tight lg:text-3xl">{p.name}</h1>
            <ProjectStatusBadge status={p.status as ProjectStatus} />
          </div>
          {p.code ? <p className="font-mono text-sm text-muted-foreground">{p.code}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{lifecycleActions}</div>
      </div>

      {fullProject ? (
        <Card className="rounded-xl border bg-card shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Datos del proyecto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              <MetaItem label="Cliente">
                {fullProject.client ? (
                  <Link
                    href={`/directorio/${fullProject.client.id}`}
                    className="underline underline-offset-2"
                  >
                    {fullProject.client.fantasyName ?? fullProject.client.legalName}
                  </Link>
                ) : (
                  "—"
                )}
              </MetaItem>
              <MetaItem label="Tipo">{TYPE_LABELS[fullProject.type]}</MetaItem>
              <MetaItem label="Inicio">{locDate(fullProject.startDate)}</MetaItem>
              <MetaItem label={fullProject.actualEndDate ? "Fin" : "Fin estimado"}>
                {fullProject.actualEndDate ? (
                  <>
                    {locDate(fullProject.actualEndDate)}
                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                      Est. {locDate(fullProject.expectedEndDate)}
                    </span>
                  </>
                ) : (
                  locDate(fullProject.expectedEndDate)
                )}
              </MetaItem>
            </dl>

            {(fullProject.description || projectAddress(fullProject)) && (
              <dl className="grid gap-3 border-t border-border/60 pt-3 sm:grid-cols-2">
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">Descripción</dt>
                  <dd className="mt-0.5 text-sm leading-snug text-foreground/90 break-words">
                    {fullProject.description?.trim() || "—"}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">Dirección</dt>
                  <dd className="mt-0.5 text-sm leading-snug text-foreground/90 break-words">
                    {projectAddress(fullProject) || "—"}
                  </dd>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>
      ) : null}

      <KpiStatGrid title="Indicadores" columns={4}>
        {dashboard.compactKpis.map((k) => (
          <DashboardKpiCard key={k.key} kpi={k} />
        ))}
      </KpiStatGrid>

      {dashboard.budgetInsightKpis.length > 0 ? (
        <KpiStatGrid title="Presupuesto" columns={4}>
          {dashboard.budgetInsightKpis.map((k) => (
            <DashboardKpiCard key={k.key} kpi={k} />
          ))}
        </KpiStatGrid>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Evolución</h2>
        <ProjectOverviewCharts
          projectId={projectId}
          billingVsCollections={dashboard.billingVsCollections}
          cashFlowMini={dashboard.cashFlowMini}
          cashFlowHref={dashboard.kpis.cashFlow?.href}
        />
      </section>

      <ProjectOverviewAlerts alerts={dashboard.alerts} />
      <ProjectOverviewActivityCard activity={dashboard.activity} projectId={projectId} />
    </div>
  );
}
