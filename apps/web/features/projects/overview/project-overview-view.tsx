import Link from "next/link";
import { formatDate, formatDateTime } from "@/lib/format";
import type { ProjectStatus } from "@bloqer/database";
import type { ProjectOverviewDashboard } from "@bloqer/services";
import type { ProjectWithClient } from "@bloqer/services";
import { ProjectStatusBadge } from "@/features/projects";
import { DashboardKpiCard } from "@/features/dashboard/dashboard-kpi-card";
import { ProjectOverviewActivityCard } from "./project-overview-activity-card";
import { ProjectOverviewAlerts } from "./project-overview-alerts";
import { ProjectOverviewCharts } from "./project-overview-charts";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";
import { DetailField, DetailFieldGrid } from "@/components/ui/detail-field-grid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageBackLink } from "@/components/layout/page-back-link";

const TYPE_LABELS = { PUBLIC: "Público", PRIVATE: "Privado" } as const;

function locDate(d: Date | null | undefined) {
  if (!d) return "—";
  return formatDate(d);
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
      <PageBackLink href="/proyectos" label="Proyectos" />
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
          <CardHeader>
            <CardTitle className="text-base">Datos del proyecto</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailFieldGrid>
              <DetailField label="Cliente">
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
              </DetailField>
              <DetailField label="Tipo">{TYPE_LABELS[fullProject.type]}</DetailField>
              <DetailField label="Inicio">{locDate(fullProject.startDate)}</DetailField>
              <DetailField label="Fin estimado">{locDate(fullProject.expectedEndDate)}</DetailField>
              {fullProject.actualEndDate ? (
                <DetailField label="Fin real">{locDate(fullProject.actualEndDate)}</DetailField>
              ) : null}
              <DetailField label="Dirección" fullWidth>
                {[fullProject.address, fullProject.city, fullProject.province].filter(Boolean).join(", ") || "—"}
              </DetailField>
            </DetailFieldGrid>
          </CardContent>
        </Card>
      ) : null}

      <KpiStatGrid title="Indicadores" columns={4}>
        {dashboard.compactKpis.map((k) => (
          <DashboardKpiCard key={k.key} kpi={k} />
        ))}
      </KpiStatGrid>

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
