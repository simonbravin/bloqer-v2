"use client";

import { Button } from "@/components/ui/button";
import { deleteScheduledReportAction } from "@/app/(app)/configuracion/scheduled-report-actions";

export function ScheduledReportDeleteButton({ id }: { id: string }) {
  return (
    <form
      action={deleteScheduledReportAction.bind(null, id)}
      onSubmit={(e) => {
        if (!confirm("¿Eliminar este envío programado?")) e.preventDefault();
      }}
    >
      <Button type="submit" variant="destructive">
        Eliminar
      </Button>
    </form>
  );
}
