"use client";

import { useEffect } from "react";
import Link from "next/link";
import type { FieldHomeView } from "@bloqer/services";
import { ProjectStatusBadge } from "@/features/projects/components/project-status-badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { fieldQuickActionHref, type FieldQuickActionId } from "@/lib/field-quick-actions";
import { useFieldProjectContext } from "@/lib/field-project-context";
import {
  clearLastProjectIdCookie,
  readLastProjectIdFromDocument,
  writeLastProjectIdCookie,
} from "@/lib/last-project-cookie";

const SCHEDULE_STATUS: Record<string, string> = {
  PLANNED: "Planificada",
  IN_PROGRESS: "En curso",
  BLOCKED: "Bloqueada",
  COMPLETED: "Completada",
  CANCELLED: "Anulada",
};

const QUICK: { id: FieldQuickActionId; label: string }[] = [
  { id: "jobsiteLog", label: "Nuevo parte" },
  { id: "purchaseRequest", label: "Solicitar compra" },
  { id: "consumption", label: "Registrar consumo" },
  { id: "document", label: "Subir foto/documento" },
];

type Props = {
  home: FieldHomeView;
};

export function MobileFieldHome({ home }: Props) {
  const { convenienceProjectId } = useFieldProjectContext();
  const featured =
    home.projects.find((project) => project.id === convenienceProjectId) ?? home.featuredProject;
  const needsProjectSelection = home.projects.length > 1 && featured == null;

  useEffect(() => {
    if (featured) {
      writeLastProjectIdCookie(featured.id);
      return;
    }
    const cookieId = readLastProjectIdFromDocument();
    if (cookieId && !home.projects.some((project) => project.id === cookieId)) {
      clearLastProjectIdCookie();
    }
  }, [featured, featured?.id, home.projects]);
  const actions = QUICK.filter((action) => home.actions[action.id]).slice(0, 4);
  const obraHref = featured ? `/proyectos/${featured.id}` : "/proyectos";
  const cronogramaHref =
    featured && home.canViewSchedule
      ? `/proyectos/${featured.id}/cronograma?field=today`
      : "/proyectos";
  const pendingBits: string[] = [];
  if (home.pendingCounts.purchaseRequests > 0) {
    pendingBits.push(
      `${home.pendingCounts.purchaseRequests} solicitud${home.pendingCounts.purchaseRequests === 1 ? "" : "es"} de compra por gestionar`,
    );
  }
  if (home.pendingCounts.purchaseOrders > 0) {
    pendingBits.push(
      `${home.pendingCounts.purchaseOrders} orden${home.pendingCounts.purchaseOrders === 1 ? "" : "es"} por aprobar`,
    );
  }
  if (home.pendingCounts.purchaseOrdersToConfirm > 0) {
    pendingBits.push(
      `${home.pendingCounts.purchaseOrdersToConfirm} orden${home.pendingCounts.purchaseOrdersToConfirm === 1 ? "" : "es"} por confirmar`,
    );
  }
  if (home.pendingCounts.purchaseOrdersToReceive > 0) {
    pendingBits.push(
      `${home.pendingCounts.purchaseOrdersToReceive} orden${home.pendingCounts.purchaseOrdersToReceive === 1 ? "" : "es"} por recibir`,
    );
  }
  if (home.pendingCounts.jobsiteLogs > 0) {
    pendingBits.push(
      `${home.pendingCounts.jobsiteLogs} parte${home.pendingCounts.jobsiteLogs === 1 ? "" : "s"} por revisar`,
    );
  }
  const certTotal = home.pendingCounts.certifications + home.pendingCounts.subcontractCertifications;
  if (certTotal > 0) {
    pendingBits.push(`${certTotal} certificación${certTotal === 1 ? "" : "es"} por aprobar`);
  }

  return (
    <div className="space-y-4" data-testid="field-home" data-query-ms={home.queryMs}>
      {featured ? (
        <section className="rounded-lg border bg-card p-4" data-testid="field-home-obra">
          <p className="text-xs font-medium uppercase text-muted-foreground">Obra</p>
          <div className="mt-1 flex items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">{featured.name}</h2>
              <p className="text-sm text-muted-foreground">{featured.code}</p>
            </div>
            <ProjectStatusBadge status={featured.status} />
          </div>
          <Button asChild className="mt-4 min-h-11 w-full">
            <Link href={obraHref}>Abrir obra</Link>
          </Button>
        </section>
      ) : (
        <section className="rounded-lg border bg-card p-4" data-testid="field-home-obra">
          <p className="text-xs font-medium uppercase text-muted-foreground">Obra</p>
          <h2 className="mt-1 text-lg font-semibold">
            {needsProjectSelection ? "Elegí una obra" : "No hay obras"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {needsProjectSelection
              ? "Tenés más de una obra. Seleccioná con cuál vas a trabajar."
              : "Cuando tengas un proyecto activo va a aparecer acá."}
          </p>
          <Button asChild className="mt-4 min-h-11 w-full" data-testid="field-select-obra">
            <Link href="/proyectos">Seleccionar obra</Link>
          </Button>
        </section>
      )}

      {actions.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Acciones rápidas</h2>
          <div className="grid grid-cols-2 gap-2">
            {actions.map((action) => {
              const href = featured
                ? fieldQuickActionHref(featured.id, action.id)
                : "/proyectos";
              return (
                <Button key={action.id} asChild variant="outline" className="min-h-11">
                  <Link href={href} data-testid={`field-home-action-${action.id}`}>
                    {action.label}
                  </Link>
                </Button>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="rounded-lg border bg-card p-4" data-testid="field-home-hoy">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Hoy</h2>
          {featured && home.canViewSchedule ? (
            <Link href={cronogramaHref} className="text-sm font-medium underline">
              Ver cronograma
            </Link>
          ) : featured ? null : (
            <Link href="/proyectos" className="text-sm font-medium underline">
              Ver cronograma
            </Link>
          )}
        </div>
        {home.todayItems.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No hay tareas activas para mostrar.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {home.todayItems.map((item) => {
              const href = home.canViewSchedule
                ? `/proyectos/${item.projectId}/cronograma?field=today&itemId=${item.id}`
                : `/proyectos/${item.projectId}`;
              return (
                <li key={item.id}>
                  <Link
                    href={href}
                    className="block rounded-md border p-3"
                    data-testid="field-home-today-item"
                  >
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {SCHEDULE_STATUS[item.status] ?? item.status}
                      {item.endDate ? ` · ${formatDate(item.endDate)}` : ""}
                      {item.daysLate ? ` · ${item.daysLate} d atrasada` : ""}
                    </p>
                    {!featured ? (
                      <p className="text-xs text-muted-foreground">
                        {item.projectCode} · {item.projectName}
                      </p>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-lg border bg-card p-4" data-testid="field-home-pendientes">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Pendientes</h2>
          <Link href="/pendientes" className="text-sm font-medium underline">
            Ver pendientes
          </Link>
        </div>
        {home.pendingCounts.total === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No tenés acciones pendientes.</p>
        ) : (
          <ul className="mt-3 space-y-1 text-sm">
            {pendingBits.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Clears a last-obra cookie when Inicio has no operational projects. */
export function ClearStaleLastProjectCookie() {
  useEffect(() => {
    clearLastProjectIdCookie();
  }, []);
  return null;
}
