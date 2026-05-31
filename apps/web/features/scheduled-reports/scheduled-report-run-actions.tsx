"use client";

import { Button } from "@/components/ui/button";
import {
  retryScheduledReportFailedAction,
  runScheduledReportNowAction,
} from "@/app/(app)/configuracion/scheduled-report-actions";

type Props = {
  scheduleId: string;
  status: "ACTIVE" | "PAUSED" | "DELETED";
  failedDeliveryCount: number;
};

export function ScheduledReportRunActions({ scheduleId, status, failedDeliveryCount }: Props) {
  if (status === "DELETED") return null;

  return (
    <div className="flex flex-wrap gap-2">
      {status === "ACTIVE" ? (
        <form
          action={runScheduledReportNowAction.bind(null, scheduleId)}
          onSubmit={(e) => {
            if (
              !confirm(
                "¿Ejecutar este envío ahora? No cambia la próxima fecha programada. Los destinatarios recibirán el correo si Resend está configurado.",
              )
            ) {
              e.preventDefault();
            }
          }}
        >
          <Button type="submit" variant="secondary" size="sm">
            Ejecutar ahora
          </Button>
        </form>
      ) : null}
      {failedDeliveryCount > 0 ? (
        <form
          action={retryScheduledReportFailedAction.bind(null, scheduleId)}
          onSubmit={(e) => {
            if (
              !confirm(
                `¿Reintentar ${failedDeliveryCount} envío(s) fallido(s) de los últimos 7 días? Solo se reenvía a destinatarios con estado FAILED.`,
              )
            ) {
              e.preventDefault();
            }
          }}
        >
          <Button type="submit" variant="outline" size="sm">
            Reintentar fallidos ({failedDeliveryCount})
          </Button>
        </form>
      ) : null}
    </div>
  );
}
