"use client";

import { useActionState } from "react";
import type { OperationalAlertType } from "@bloqer/services";
import { Button } from "@/components/ui/button";
import { runOperationalAlertsDispatchAction, type OperationalAlertsActionState } from "./actions";

const initialState: OperationalAlertsActionState = { status: "idle" };

const SINGLE_ALERTS: ReadonlyArray<{ type: OperationalAlertType; label: string }> = [
  { type: "overdueReceivables", label: "AR vencida" },
  { type: "overduePayables", label: "AP vencida" },
  { type: "negativeStock", label: "Stock negativo" },
  { type: "approvedCertificationsWithoutInvoice", label: "Certificaciones aprobadas sin factura" },
  { type: "staleUploadingDocuments", label: "Uploads pendientes" },
];

function ResultPanel({ state }: { state: OperationalAlertsActionState }) {
  if (state.status === "idle") return null;
  if (state.status === "error") {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
        <p className="font-medium text-destructive">Error</p>
        <p className="text-muted-foreground">{state.message}</p>
      </div>
    );
  }

  if (state.kind === "single") {
    const r = state.result;
    return (
      <div className="rounded-lg border bg-card p-4 text-sm">
        <p className="font-medium">Última ejecución</p>
        <ul className="mt-2 space-y-1 text-muted-foreground">
          <li>Revisadas: {r.checkedCount}</li>
          <li>Creadas: {r.createdCount}</li>
          <li>Omitidas (duplicado): {r.skippedCount}</li>
          <li>Errores: {r.errors.length}</li>
        </ul>
        {r.errors.length > 0 && (
          <ul className="mt-3 max-h-40 list-disc overflow-y-auto pl-5 text-xs text-muted-foreground">
            {r.errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const { runs, totals } = state.result;
  return (
    <div className="rounded-lg border bg-card p-4 text-sm">
      <p className="font-medium">Última ejecución (todas)</p>
      <ul className="mt-2 space-y-1 text-muted-foreground">
        <li>Revisadas (total): {totals.checkedCount}</li>
        <li>Creadas (total): {totals.createdCount}</li>
        <li>Omitidas (total): {totals.skippedCount}</li>
        <li>Errores (total): {totals.errorCount}</li>
      </ul>
      <div className="mt-4 space-y-3 border-t pt-3">
        {runs.map((r) => (
          <div key={r.alertType} className="text-xs">
            <p className="font-medium text-foreground">
              {SINGLE_ALERTS.find((x) => x.type === r.alertType)?.label ?? r.alertType}
            </p>
            <p className="text-muted-foreground">
              revisadas {r.checkedCount} · creadas {r.createdCount} · omitidas {r.skippedCount} · errores{" "}
              {r.errors.length}
            </p>
            {r.errors.length > 0 && (
              <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                {r.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function OperationalAlertsPanel() {
  const [state, dispatch] = useActionState(runOperationalAlertsDispatchAction, initialState);

  return (
    <div className="space-y-6">
      <form action={dispatch} className="space-y-3">
        <input type="hidden" name="intent" value="all" />
        <Button type="submit" className="w-full sm:w-auto">
          Ejecutar todas
        </Button>
      </form>

      <div className="flex flex-wrap gap-2">
        {SINGLE_ALERTS.map((a) => (
          <form key={a.type} action={dispatch}>
            <input type="hidden" name="intent" value="single" />
            <input type="hidden" name="alertType" value={a.type} />
            <Button type="submit" variant="outline" size="sm">
              {a.label}
            </Button>
          </form>
        ))}
      </div>

      <ResultPanel state={state} />
    </div>
  );
}
