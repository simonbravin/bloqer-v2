import Link from "next/link";
import type { ScheduledReportDetail } from "@bloqer/services";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import {
  SCHEDULED_REPORT_FREQUENCY_LABEL,
  SCHEDULED_REPORT_RUN_STATUS_HINT,
  SCHEDULED_REPORT_RUN_STATUS_LABEL,
  SCHEDULED_REPORT_STATUS_LABEL,
  runStatusBadgeVariant,
} from "./scheduled-report-labels";

type Props = {
  detail: ScheduledReportDetail;
  emailsFilterHref?: string;
};

export function ScheduledReportStatusPanel({ detail, emailsFilterHref }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Estado del envío</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-sm">
        <div>
          <p className="text-muted-foreground">Estado configuración</p>
          <Badge variant={detail.status === "ACTIVE" ? "default" : "secondary"} className="mt-1">
            {SCHEDULED_REPORT_STATUS_LABEL[detail.status]}
          </Badge>
        </div>
        <div>
          <p className="text-muted-foreground">Próxima ejecución</p>
          <p className="mt-1 font-medium">{formatDateTime(detail.nextRunAt)}</p>
          <p className="text-xs text-muted-foreground">{detail.timezone}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Última corrida</p>
          <p className="mt-1 font-medium">
            {detail.lastRunAt ? formatDateTime(detail.lastRunAt) : "Sin ejecuciones aún"}
          </p>
          {detail.lastRunStatus ? (
            <>
              <Badge
                variant={runStatusBadgeVariant(detail.lastRunStatus)}
                className="mt-1"
                title={SCHEDULED_REPORT_RUN_STATUS_HINT[detail.lastRunStatus]}
              >
                {SCHEDULED_REPORT_RUN_STATUS_LABEL[detail.lastRunStatus]}
              </Badge>
              <p className="mt-1 text-xs text-muted-foreground">
                {SCHEDULED_REPORT_RUN_STATUS_HINT[detail.lastRunStatus]}
              </p>
            </>
          ) : null}
        </div>
        <div>
          <p className="text-muted-foreground">Programación</p>
          <p className="mt-1">
            {SCHEDULED_REPORT_FREQUENCY_LABEL[detail.frequency] ?? detail.frequency} · {detail.timeOfDay}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Formato adjuntos</p>
          <p className="mt-1 font-medium">{detail.format}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Contenido</p>
          <p className="mt-1">
            {detail.itemCount} reporte{detail.itemCount === 1 ? "" : "s"} · {detail.recipientCount} destinatario
            {detail.recipientCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap gap-x-4 gap-y-1">
          {emailsFilterHref ? (
            <Link
              href={emailsFilterHref}
              className="text-primary text-sm underline-offset-4 hover:underline"
            >
              Ver emails de este envío
            </Link>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
