import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatDateTime } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { loadScheduledReportFormData } from "@/lib/scheduled-report-form-data";
import {
  canManageScheduledReports,
  countRecentFailedScheduledReportDeliveries,
  getScheduledReportById,
  groupScheduledReportDeliveriesIntoRuns,
  listScheduledReportEmailDeliveries,
} from "@bloqer/services";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/layout/page-shell";
import { ScheduledReportForm } from "@/features/scheduled-reports/scheduled-report-form";
import { ScheduledReportDeleteButton } from "@/features/scheduled-reports/scheduled-report-delete-button";
import { ScheduledReportStatusPanel } from "@/features/scheduled-reports/scheduled-report-status-panel";
import { ScheduledReportExecutionHistory } from "@/features/scheduled-reports/scheduled-report-execution-history";
import { ScheduledReportRunActions } from "@/features/scheduled-reports/scheduled-report-run-actions";
import {
  deactivateScheduledReportAction,
  reactivateScheduledReportAction,
} from "../../scheduled-report-actions";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; err?: string; detail?: string }>;
};

export default async function EditarReporteProgramadoPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");
  if (!canManageScheduledReports(ctx)) notFound();

  let detail;
  try {
    detail = await getScheduledReportById(ctx, id);
  } catch {
    notFound();
  }

  const [formData, deliveries, failedDeliveryCount] = await Promise.all([
    loadScheduledReportFormData(ctx),
    listScheduledReportEmailDeliveries(ctx, id, 80),
    countRecentFailedScheduledReportDeliveries(ctx, id),
  ]);
  const runs = groupScheduledReportDeliveriesIntoRuns(deliveries);

  const okMessages: Record<string, string> = {
    created: "Envío programado creado.",
    updated: "Cambios guardados.",
    paused: "Envío pausado.",
    reactivated: "Envío reactivado.",
    ran_now: "Ejecución manual completada.",
    retried: "Reintento de fallidos completado.",
  };

  const emailsFilterHref = `/notificaciones/emails?emailType=REPORT_SCHEDULED&scheduledReportId=${id}`;

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{detail.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configuración de envío programado · Próxima ejecución: {formatDateTime(detail.nextRunAt)}
          </p>
          {sp.ok && okMessages[sp.ok] ? (
            <p className="mt-2 text-sm text-green-600 dark:text-green-500">
              {okMessages[sp.ok]}
              {sp.detail ? (
                <span className="block text-muted-foreground mt-1">{decodeURIComponent(sp.detail)}</span>
              ) : null}
            </p>
          ) : null}
          {sp.err ? (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {decodeURIComponent(sp.err)}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/configuracion/reportes">Volver al listado</Link>
          </Button>
          {detail.status === "ACTIVE" ? (
            <form action={deactivateScheduledReportAction.bind(null, id)}>
              <Button type="submit" variant="secondary">
                Pausar
              </Button>
            </form>
          ) : detail.status === "PAUSED" ? (
            <form action={reactivateScheduledReportAction.bind(null, id)}>
              <Button type="submit" variant="secondary">
                Reactivar
              </Button>
            </form>
          ) : null}
          {detail.status !== "DELETED" ? <ScheduledReportDeleteButton id={id} /> : null}
        </div>
      </div>

      <ScheduledReportStatusPanel detail={detail} emailsFilterHref={emailsFilterHref} />

      {detail.status !== "DELETED" ? (
        <ScheduledReportRunActions
          scheduleId={id}
          status={detail.status}
          failedDeliveryCount={failedDeliveryCount}
        />
      ) : null}

      <ScheduledReportExecutionHistory runs={runs} deliveries={deliveries} />

      {detail.status === "DELETED" ? (
        <p className="text-sm text-muted-foreground">Este envío fue eliminado y no se puede editar.</p>
      ) : (
        <>
          <h2 className="text-lg font-semibold tracking-tight">Editar configuración</h2>
          <ScheduledReportForm
            mode="edit"
            defaultTimezone={formData.defaultTimezone}
            tenantCatalog={formData.tenantCatalog}
            projectCatalog={formData.projectCatalog}
            members={formData.members}
            projects={formData.projects}
            lockScope={detail.scope}
            lockProjectId={detail.projectId ?? undefined}
            initial={{
              id: detail.id,
              name: detail.name,
              scope: detail.scope,
              projectId: detail.projectId ?? undefined,
              format: detail.format,
              frequency: detail.frequency,
              dayOfWeek: detail.dayOfWeek ?? undefined,
              dayOfMonth: detail.dayOfMonth ?? undefined,
              timeOfDay: detail.timeOfDay,
              timezone: detail.timezone,
              reportKeys: detail.items.map((i) => i.reportKey),
              recipientUserIds: detail.recipients.map((r) => r.recipientUserId),
              params: detail.params,
            }}
          />
        </>
      )}
    </PageShell>
  );
}
