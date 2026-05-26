import { formatDate, formatDateTime } from "@/lib/format";
import Link from "next/link";
import type { ProjectStatus } from "@bloqer/database";
import type { ProjectOverviewDashboard } from "@bloqer/services";
import type { ProjectWithClient } from "@bloqer/services";
import { ProjectStatusBadge } from "@/features/projects";
import { ProjectOverviewActivityCard } from "./project-overview-activity-card";
import { ProjectOverviewAlerts } from "./project-overview-alerts";
import { ProjectOverviewCharts } from "./project-overview-charts";
import { ProjectOverviewKpiCard } from "./project-overview-kpi-card";
import { ProjectOverviewMoneyList } from "./project-overview-money-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
  const sched = dashboard.scheduleProgress;
  const cashFlowHref = dashboard.kpis.cashFlow?.available ? dashboard.kpis.cashFlow.href : undefined;

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-bold tracking-tight lg:text-3xl">{p.name}</h1>
            <ProjectStatusBadge status={p.status as ProjectStatus} />
          </div>
          {p.code ? <p className="font-mono text-sm text-muted-foreground">{p.code}</p> : null}
          <p className="max-w-2xl text-sm text-muted-foreground">
            Resumen ejecutivo del proyecto. Los detalles están en cada sección del menú lateral.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{lifecycleActions}</div>
      </div>

      {fullProject ? (
        <Card className="rounded-xl border bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Datos del proyecto</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Cliente</dt>
                <dd className="font-medium">
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
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Tipo</dt>
                <dd className="font-medium">{TYPE_LABELS[fullProject.type]}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Inicio</dt>
                <dd className="font-medium">{locDate(fullProject.startDate)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Fin estimado</dt>
                <dd className="font-medium">{locDate(fullProject.expectedEndDate)}</dd>
              </div>
              {fullProject.actualEndDate ? (
                <div>
                  <dt className="text-muted-foreground">Fin real</dt>
                  <dd className="font-medium">{locDate(fullProject.actualEndDate)}</dd>
                </div>
              ) : null}
              <div className="col-span-2">
                <dt className="text-muted-foreground">Dirección</dt>
                <dd className="font-medium">
                  {[fullProject.address, fullProject.city, fullProject.province].filter(Boolean).join(", ") || "—"}
                </dd>
              </div>
              {fullProject.description ? (
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Descripción</dt>
                  <dd className="whitespace-pre-wrap font-medium">{fullProject.description}</dd>
                </div>
              ) : null}
              {fullProject.notes ? (
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Notas</dt>
                  <dd className="whitespace-pre-wrap font-medium">{fullProject.notes}</dd>
                </div>
              ) : null}
            </dl>
          </CardContent>
        </Card>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Indicadores</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <ProjectOverviewKpiCard title="Avance de cronograma" description="Desde el inicio hasta hoy, respecto del fin estimado.">
            {sched.percent !== null ? (
              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-3xl font-bold tabular-nums">{sched.percent}%</span>
                  <span className="text-xs text-muted-foreground">transcurrido</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full bg-primary transition-all",
                      sched.percent >= 100 && "bg-amber-600",
                    )}
                    style={{ width: `${Math.min(100, sched.percent)}%` }}
                  />
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{sched.note ?? "—"}</p>
            )}
          </ProjectOverviewKpiCard>

          <ProjectOverviewKpiCard
            title="Presupuesto"
            description="Última versión aprobada o cerrada (total de venta)."
            href={dashboard.kpis.budget?.href}
            footerLabel={dashboard.kpis.budget ? "Ver presupuestos" : undefined}
          >
            {dashboard.kpis.budget ? (
              <>
                {dashboard.kpis.budget.status ? (
                  <p className="mb-2 text-xs text-muted-foreground">Estado: {dashboard.kpis.budget.status}</p>
                ) : null}
                <ProjectOverviewMoneyList
                  rows={dashboard.kpis.budget.amountByCurrency}
                  emptyLabel="Todavía no hay presupuesto aprobado o cerrado."
                />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No tenés acceso al presupuesto o el módulo está deshabilitado.</p>
            )}
          </ProjectOverviewKpiCard>

          <ProjectOverviewKpiCard
            title="Cuentas por cobrar"
            description="Saldos abiertos y vencidos por moneda."
            href={dashboard.kpis.receivables?.href}
            footerLabel={dashboard.kpis.receivables ? "Ver cuentas por cobrar" : undefined}
          >
            {dashboard.kpis.receivables ? (
              <div className="space-y-3">
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Abierto</p>
                  <ProjectOverviewMoneyList
                    rows={dashboard.kpis.receivables.openByCurrency}
                    emptyLabel="Sin saldos abiertos."
                  />
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Vencido</p>
                  <ProjectOverviewMoneyList
                    rows={dashboard.kpis.receivables.overdueByCurrency}
                    emptyLabel="Sin vencidos."
                  />
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Sin acceso a cuentas por cobrar del proyecto.</p>
            )}
          </ProjectOverviewKpiCard>

          <ProjectOverviewKpiCard
            title="Cuentas por pagar"
            description="Saldos abiertos y vencidos por moneda."
            href={dashboard.kpis.payables?.href}
            footerLabel={dashboard.kpis.payables ? "Ver cuentas por pagar" : undefined}
          >
            {dashboard.kpis.payables ? (
              <div className="space-y-3">
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Abierto</p>
                  <ProjectOverviewMoneyList
                    rows={dashboard.kpis.payables.openByCurrency}
                    emptyLabel="Sin saldos abiertos."
                  />
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Vencido</p>
                  <ProjectOverviewMoneyList
                    rows={dashboard.kpis.payables.overdueByCurrency}
                    emptyLabel="Sin vencidos."
                  />
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Sin acceso a cuentas por pagar del proyecto.</p>
            )}
          </ProjectOverviewKpiCard>

          <ProjectOverviewKpiCard
            title="Flujo de caja"
            description="Cobros y pagos imputados a la obra."
            href={cashFlowHref}
            footerLabel={cashFlowHref ? "Ver detalle" : undefined}
          >
            {dashboard.kpis.cashFlow?.available ? (
              <p className="text-sm text-muted-foreground">
                Serie mensual arriba. Moneda principal según movimientos del proyecto.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Sin permiso o módulo deshabilitado para ver flujo de caja.</p>
            )}
          </ProjectOverviewKpiCard>

          <ProjectOverviewKpiCard
            title="Control de costos"
            description="Presupuesto vs capas de costo por WBS."
            href={dashboard.kpis.costControl?.available ? dashboard.kpis.costControl.href : undefined}
            footerLabel={dashboard.kpis.costControl?.available ? "Abrir control" : undefined}
          >
            {dashboard.kpis.costControl?.available ? (
              <p className="text-sm text-muted-foreground">Comparativo detallado en la vista de control de costos.</p>
            ) : (
              <p className="text-sm text-muted-foreground">Sin acceso al control de costos.</p>
            )}
          </ProjectOverviewKpiCard>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Evolución</h2>
        <ProjectOverviewCharts
          projectId={projectId}
          billingVsCollections={dashboard.billingVsCollections}
          cashFlowMini={dashboard.cashFlowMini}
          cashFlowHref={cashFlowHref}
        />
      </section>

      <ProjectOverviewAlerts alerts={dashboard.alerts} />

      <ProjectOverviewActivityCard activity={dashboard.activity} projectId={projectId} />
    </div>
  );
}
