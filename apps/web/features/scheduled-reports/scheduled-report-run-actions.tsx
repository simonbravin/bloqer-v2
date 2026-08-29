"use client";

import { Button } from "@/components/ui/button";
import { retryScheduledReportFailedAction } from "@/app/(app)/configuracion/scheduled-report-actions";

type Props = {
  scheduleId: string;
  status: "ACTIVE" | "PAUSED" | "DELETED";
  failedDeliveryCount: number;
};

/** Retry-only strip; manual send lives in the page header (Enviar ahora). */
export function ScheduledReportRunActions({ scheduleId, status, failedDeliveryCount }: Props) {
  if (status === "DELETED" || failedDeliveryCount <= 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
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
    </div>
  );
}
