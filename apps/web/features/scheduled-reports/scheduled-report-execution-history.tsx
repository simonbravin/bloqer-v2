import type {
  ScheduledReportEmailDeliveryRow,
  ScheduledReportExecutionRun,
} from "@bloqer/services";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import { formatDateTime } from "@/lib/format";
import {
  EMAIL_DELIVERY_STATUS_HINT,
  EMAIL_DELIVERY_STATUS_LABEL,
  deliveryStatusBadgeVariant,
} from "./scheduled-report-labels";

function deliveryDetail(row: ScheduledReportEmailDeliveryRow): string {
  if (row.skippedReason) return row.skippedReason;
  if (row.errorMessage) return row.errorMessage;
  return EMAIL_DELIVERY_STATUS_HINT[row.status] ?? "—";
}

function runSummary(run: ScheduledReportExecutionRun): string {
  const parts: string[] = [];
  if (run.sentCount) parts.push(`${run.sentCount} enviado${run.sentCount === 1 ? "" : "s"}`);
  if (run.failedCount) parts.push(`${run.failedCount} fallido${run.failedCount === 1 ? "" : "s"}`);
  if (run.skippedCount)
    parts.push(`${run.skippedCount} omitido${run.skippedCount === 1 ? "" : "s"}`);
  if (run.pendingCount)
    parts.push(`${run.pendingCount} pendiente${run.pendingCount === 1 ? "" : "s"}`);
  return parts.length > 0 ? parts.join(" · ") : "Sin entregas registradas";
}

type Props = {
  runs: ScheduledReportExecutionRun[];
  deliveries: ScheduledReportEmailDeliveryRow[];
};

export function ScheduledReportExecutionHistory({ runs, deliveries }: Props) {
  const hasHistory = deliveries.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Historial de ejecuciones</CardTitle>
        <CardDescription>
          Cada corrida del cron puede generar varios registros (uno por destinatario). Agrupado por
          ventana de ejecución; los registros históricos sin identificador de corrida se muestran
          por separado para no mezclar envíos distintos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!hasHistory ? (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              Todavía no hay intentos de envío registrados. Cuando el cron ejecute este envío,
              aparecerán aquí.
            </p>
            <p>
              Si la última corrida figura como <strong>Omitido</strong>, suele ser porque Resend no
              está configurado o no hay destinatarios válidos — no es lo mismo que{" "}
              <strong>Fallido</strong>.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Por corrida</h3>
              <div className="space-y-2">
                {runs.map((run) => (
                  <details
                    key={run.runKey}
                    className="group rounded-lg border bg-card px-3 py-2 open:pb-3"
                  >
                    <summary className="cursor-pointer list-none text-sm [&::-webkit-details-marker]:hidden">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{formatDateTime(run.at)}</span>
                        <span className="text-muted-foreground text-xs">{runSummary(run)}</span>
                      </div>
                      {run.runWindow ? (
                        <p
                          className="text-xs text-muted-foreground mt-0.5 truncate"
                          title={run.runWindow}
                        >
                          Ventana: {run.runWindow}
                        </p>
                      ) : null}
                    </summary>
                    <TableScroll className="mt-3">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Destinatario</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead>Detalle</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {run.deliveries.map((d) => (
                            <TableRow key={d.id}>
                              <TableCell className="text-sm max-w-[200px] truncate">
                                {d.recipientEmail}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={deliveryStatusBadgeVariant(d.status)}
                                  title={EMAIL_DELIVERY_STATUS_HINT[d.status]}
                                >
                                  {EMAIL_DELIVERY_STATUS_LABEL[d.status]}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground max-w-[240px] truncate">
                                {deliveryDetail(d)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableScroll>
                  </details>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-medium">Últimos intentos (detalle)</h3>
              <TableScroll>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Destinatario</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Detalle</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deliveries.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDateTime(d.createdAt)}
                        </TableCell>
                        <TableCell className="text-sm max-w-[180px] truncate">
                          {d.recipientEmail}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={deliveryStatusBadgeVariant(d.status)}
                            title={EMAIL_DELIVERY_STATUS_HINT[d.status]}
                          >
                            {EMAIL_DELIVERY_STATUS_LABEL[d.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate">
                          {deliveryDetail(d)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableScroll>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
