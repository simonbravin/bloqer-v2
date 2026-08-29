"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmAlertDialog } from "@/components/ui/reason-alert-dialog";
import { runScheduledReportNowAction } from "@/app/(app)/configuracion/scheduled-report-actions";
import { isNextRedirectError } from "@/lib/next-errors";

type Props = {
  id: string;
  scheduleName: string;
  recipientCount: number;
};

/**
 * Manual send for an existing ACTIVE schedule. Does not advance nextRunAt.
 */
export function ScheduledReportSendNowButton({
  id,
  scheduleName,
  recipientCount,
}: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const canSend = recipientCount > 0;

  return (
    <>
      <Button
        type="button"
        variant="default"
        disabled={!canSend}
        title={
          canSend
            ? undefined
            : "Agregá al menos un destinatario antes de enviar"
        }
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        Enviar ahora
      </Button>
      <ConfirmAlertDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setError(null);
        }}
        title="Enviar reporte ahora"
        description={
          <div className="space-y-2">
            <p>
              Se va a generar y enviar <strong>{scheduleName}</strong> a{" "}
              {recipientCount === 1
                ? "1 destinatario"
                : `${recipientCount} destinatarios`}{" "}
              ahora mismo.
            </p>
            <p>
              No cambia la próxima fecha programada. Los destinatarios reciben el
              correo si el envío de email está configurado.
            </p>
            {error ? (
              <p className="text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        }
        confirmLabel="Enviar ahora"
        cancelLabel="Cancelar"
        pending={pending}
        onConfirm={() => {
          startTransition(async () => {
            setError(null);
            try {
              await runScheduledReportNowAction(id);
            } catch (e) {
              if (isNextRedirectError(e)) throw e;
              setError(
                e instanceof Error ? e.message : "No se pudo enviar el reporte",
              );
            }
          });
        }}
      />
    </>
  );
}
