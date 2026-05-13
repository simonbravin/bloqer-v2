import Link from "next/link";
import type { ProjectStatus } from "@bloqer/database";
import type { ProjectOverviewDashboard } from "@bloqer/services";
import type { ProjectWithClient } from "@bloqer/services";
import { ProjectStatusBadge } from "@/features/projects";
import { ProjectOverviewActivityCard } from "./project-overview-activity-card";
import { ProjectOverviewAlerts } from "./project-overview-alerts";
import { ProjectOverviewBillingCard } from "./project-overview-billing-bars";
import { ProjectOverviewCostCtaCard } from "./project-overview-cost-cta-card";
import { ProjectOverviewKpiCard } from "./project-overview-kpi-card";
import { ProjectOverviewMoneyList } from "./project-overview-money-list";
import { ProjectOverviewQuickLinks } from "./project-overview-quick-links";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const TYPE_LABELS = { PUBLIC: "Público", PRIVATE: "Privado" } as const;

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("es-AR");
}

function locDate(d: Date | null | undefined) {
  if (!d) return "—";
  return d.toLocaleDateString("es-AR");
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
  const client = fullProject?.client;

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
            {p.clientName || client ? (
              <>
                Cliente:{" "}
                {client ? (
                  <Link
                    href={`/directorio/${client.id}`}
                    className="font-medium text-foreground underline underline-offset-2"
                  >
                    {client.fantasyName ?? client.legalName}
                  </Link>
                ) : (
                  <span className="font-medium text-foreground">{p.clientName}</span>
                )}
                {" · "}
              </>
            ) : null}
            Inicio {fmt(p.startDate ?? null)}
            {p.estimatedEndDate ? ` · Fin estimado ${fmt(p.estimatedEndDate)}` : null}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{lifecycleActions}</div>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
          footerLabel={dashboard.kpis.receivables ? "Ver C×C" : undefined}
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
          footerLabel={dashboard.kpis.payables ? "Ver C×P" : undefined}
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
          description="Movimientos del proyecto por periodo."
          href={dashboard.kpis.cashFlow?.available ? dashboard.kpis.cashFlow.href : undefined}
          footerLabel={dashboard.kpis.cashFlow?.available ? "Ver flujo de caja" : undefined}
        >
          {dashboard.kpis.cashFlow?.available ? (
            <p className="text-sm text-muted-foreground">Resumen disponible en la vista de flujo de caja.</p>
          ) : (
            <p className="text-sm text-muted-foreground">Sin permiso o módulo deshabilitado para ver flujo de caja.</p>
          )}
        </ProjectOverviewKpiCard>

        <ProjectOverviewKpiCard
          title="Control de costos"
          description="Compará presupuesto contra ejecutado."
          href={dashboard.kpis.costControl?.available ? dashboard.kpis.costControl.href : undefined}
          footerLabel={dashboard.kpis.costControl?.available ? "Abrir control" : undefined}
        >
          {dashboard.kpis.costControl?.available ? (
            <p className="text-sm text-muted-foreground">Informe detallado en la sección de control de costos.</p>
          ) : (
            <p className="text-sm text-muted-foreground">Sin acceso al control de costos.</p>
          )}
        </ProjectOverviewKpiCard>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {dashboard.billingVsCollections ? (
          <ProjectOverviewBillingCard data={dashboard.billingVsCollections} />
        ) : null}
        {dashboard.kpis.costControl?.available ? (
          <ProjectOverviewCostCtaCard href={dashboard.kpis.costControl.href} />
        ) : null}
      </div>

      <ProjectOverviewAlerts alerts={dashboard.alerts} />

      <ProjectOverviewActivityCard activity={dashboard.activity} projectId={projectId} />

      <ProjectOverviewQuickLinks links={dashboard.quickLinks} />

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
    </div>
  );
}
