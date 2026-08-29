"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmAlertDialog } from "@/components/ui/reason-alert-dialog";
import { deleteScheduledReportAction } from "@/app/(app)/configuracion/scheduled-report-actions";
import { isNextRedirectError } from "@/lib/next-errors";

export function ScheduledReportDeleteButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button type="button" variant="destructive" onClick={() => setOpen(true)}>
        Eliminar
      </Button>
      <ConfirmAlertDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setError(null);
        }}
        title="Eliminar envío programado"
        description={
          <div className="space-y-2">
            <p>Se eliminará este envío programado. No se pueden deshacer los correos ya enviados.</p>
            {error ? (
              <p className="text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        }
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        variant="destructive"
        pending={pending}
        onConfirm={() => {
          startTransition(async () => {
            setError(null);
            try {
              await deleteScheduledReportAction(id);
            } catch (e) {
              if (isNextRedirectError(e)) throw e;
              setError(e instanceof Error ? e.message : "No se pudo eliminar");
            }
          });
        }}
      />
    </>
  );
}
