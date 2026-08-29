"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmAlertDialog } from "@/components/ui/reason-alert-dialog";
import { retryScheduledReportFailedAction } from "@/app/(app)/configuracion/scheduled-report-actions";
import { isNextRedirectError } from "@/lib/next-errors";

type Props = {
  scheduleId: string;
  status: "ACTIVE" | "PAUSED" | "DELETED";
  failedDeliveryCount: number;
};

/** Retry-only strip; manual send lives in the page header (Enviar ahora). */
export function ScheduledReportRunActions({ scheduleId, status, failedDeliveryCount }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (status === "DELETED" || failedDeliveryCount <= 0) return null;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          Reintentar fallidos ({failedDeliveryCount})
        </Button>
      </div>
      <ConfirmAlertDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setError(null);
        }}
        title="Reintentar envíos fallidos"
        description={
          <div className="space-y-2">
            <p>
              ¿Reintentar {failedDeliveryCount} envío
              {failedDeliveryCount === 1 ? "" : "s"} fallido
              {failedDeliveryCount === 1 ? "" : "s"} de los últimos 7 días? Solo se reenvía a
              destinatarios con estado FAILED.
            </p>
            {error ? (
              <p className="text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        }
        confirmLabel="Reintentar"
        cancelLabel="Cancelar"
        pending={pending}
        onConfirm={() => {
          startTransition(async () => {
            setError(null);
            try {
              await retryScheduledReportFailedAction(scheduleId);
            } catch (e) {
              if (isNextRedirectError(e)) throw e;
              setError(e instanceof Error ? e.message : "No se pudo reintentar");
            }
          });
        }}
      />
    </>
  );
}
