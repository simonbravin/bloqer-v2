import Link from "next/link";
import type { OperationalAlertsLastActivity, OperationalNotificationType } from "@bloqer/services";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import {
  EMAIL_DELIVERY_STATUS_HINT,
  EMAIL_DELIVERY_STATUS_LABEL,
  deliveryStatusBadgeVariant,
} from "@/features/scheduled-reports/scheduled-report-labels";

const TYPE_LABEL: Record<OperationalNotificationType, string> = {
  RECEIVABLE_OVERDUE: "AR vencida",
  PAYABLE_OVERDUE: "AP vencida",
  NEGATIVE_STOCK: "Stock negativo",
  CERTIFICATION_APPROVED_WITHOUT_INVOICE: "Cert. sin factura",
  STALE_DOCUMENT_UPLOAD: "Uploads pendientes",
};

type Props = {
  activity: OperationalAlertsLastActivity;
};

export function OperationalAlertsActivityCard({ activity }: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Última actividad</CardTitle>
        <CardDescription>
          Indicios a partir de notificaciones y emails ya generados (sin historial de jobs del
          cron). Ventana de conteo: 7 días.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-muted-foreground">Última notificación in-app</p>
            <p className="mt-1 font-medium">
              {activity.lastNotificationAt
                ? formatDateTime(activity.lastNotificationAt)
                : "Sin alertas generadas aún"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {activity.notificationsLast7Days} creada
              {activity.notificationsLast7Days === 1 ? "" : "s"} en los últimos 7 días
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Último email de alerta</p>
            {activity.lastEmailAt ? (
              <>
                <p className="mt-1 font-medium">{formatDateTime(activity.lastEmailAt)}</p>
                {activity.lastEmailStatus ? (
                  <>
                    <Badge
                      variant={deliveryStatusBadgeVariant(activity.lastEmailStatus)}
                      className="mt-1"
                      title={EMAIL_DELIVERY_STATUS_HINT[activity.lastEmailStatus]}
                    >
                      {EMAIL_DELIVERY_STATUS_LABEL[activity.lastEmailStatus]}
                    </Badge>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {EMAIL_DELIVERY_STATUS_HINT[activity.lastEmailStatus]}
                    </p>
                  </>
                ) : null}
              </>
            ) : (
              <p className="mt-1 font-medium text-muted-foreground">Sin envíos registrados</p>
            )}
            <p className="mt-2">
              <Link
                href="/notificaciones/emails?emailType=OPERATIONAL_ALERT"
                className="text-primary text-xs underline-offset-4 hover:underline"
              >
                Ver emails de alertas →
              </Link>
            </p>
          </div>
        </div>

        {activity.byType.length > 0 ? (
          <ul className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
            {activity.byType.map((row) => (
              <li key={row.type} className="flex flex-wrap items-baseline justify-between gap-2">
                <span>{TYPE_LABEL[row.type] ?? row.type}</span>
                <span>
                  {row.count} · última {formatDateTime(row.lastAt)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="border-t pt-3 text-xs text-muted-foreground">
            No hay notificaciones de alerta en los últimos 7 días. Podés disparar una corrida manual
            abajo o esperar el cron diario.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
