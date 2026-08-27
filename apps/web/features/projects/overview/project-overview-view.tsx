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
import {
  resolveDetailFieldIcon,
  type DetailFieldIconAccent,
  type DetailFieldIconKey,
} from "@/lib/detail-field-icon";
import { cn } from "@/lib/utils";

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
  iconKey,
  iconAccent,
  children,
  className,
  truncate = true,
}: {
  label: string;
  iconKey: DetailFieldIconKey;
  iconAccent?: DetailFieldIconAccent;
  children: React.ReactNode;
  className?: string;
  /** Short meta values stay on one line; turn off for description/address. */
  truncate?: boolean;
}) {
  const { Icon, accentClass } = resolveDetailFieldIcon(iconKey, iconAccent);
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
            accentClass.container,
          )}
          aria-hidden
        >
          <Icon className={cn("h-3.5 w-3.5", accentClass.icon)} />
        </span>
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 pl-8 text-sm font-medium leading-snug",
          truncate ? "truncate" : "break-words",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

export function ProjectOverviewView({
  dashboard,
  projectId,
  fullProject,
  lifecycleActions,
  missingPm,
}: {
  dashboard: ProjectOverviewDashboard;
  projectId: string;
  fullProject: ProjectWithClient | null;
  lifecycleActions: React.ReactNode;
  /** Banner when the obra roster has no active PM ([D-091]). */
  missingPm?: { assignHref: string | null };
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

      {missingPm ? (
        <div
          role="status"
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100"
        >
          Hay que asignar un jefe de obra (PM) a este proyecto.
          {missingPm.assignHref ? (
            <>
              {" "}
              <Link
                href={missingPm.assignHref}
                className="font-medium underline underline-offset-2"
              >
                Asignar en Configuración
              </Link>
            </>
          ) : null}
        </div>
      ) : null}

      {fullProject ? (
        <Card className="rounded-xl border bg-card shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Datos del proyecto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <MetaItem
                label="Cliente"
                iconKey="client"
                iconAccent={fullProject.client ? undefined : "muted"}
                className="sm:col-span-1"
              >
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
              <div className="grid grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-3">
                <MetaItem label="Tipo" iconKey="type">
                  {TYPE_LABELS[fullProject.type]}
                </MetaItem>
                <MetaItem
                  label="Inicio"
                  iconKey="start_date"
                  iconAccent={fullProject.startDate ? undefined : "muted"}
                >
                  {locDate(fullProject.startDate)}
                </MetaItem>
                <MetaItem
                  label={fullProject.actualEndDate ? "Fin" : "Fin estimado"}
                  iconKey={fullProject.actualEndDate ? "actual_end" : "expected_end"}
                  iconAccent={
                    fullProject.actualEndDate || fullProject.expectedEndDate ? undefined : "muted"
                  }
                >
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
              </div>
            </dl>

            {(fullProject.description || projectAddress(fullProject)) && (
              <dl className="grid gap-3 border-t border-border/60 pt-3 sm:grid-cols-2">
                <MetaItem
                  label="Descripción"
                  iconKey="description"
                  iconAccent={fullProject.description?.trim() ? undefined : "muted"}
                  truncate={false}
                >
                  {fullProject.description?.trim() || "—"}
                </MetaItem>
                <MetaItem
                  label="Dirección"
                  iconKey="address"
                  iconAccent={projectAddress(fullProject) ? undefined : "muted"}
                  truncate={false}
                >
                  {projectAddress(fullProject) || "—"}
                </MetaItem>
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
