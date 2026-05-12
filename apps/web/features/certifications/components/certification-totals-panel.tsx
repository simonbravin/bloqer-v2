"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { CertificationStatus } from "@bloqer/database";

function fmtMoney(value: string, currency: string) {
  return (
    new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      parseFloat(value),
    ) + " " + currency
  );
}

interface CertificationTotalsPanelProps {
  status: CertificationStatus;
  currency: string;
  totalAmount: string;
  onIssue:   () => Promise<{ ok: true } | { error: string }>;
  onApprove: () => Promise<{ ok: true } | { error: string }>;
  onReject:  () => Promise<{ ok: true } | { error: string }>;
  onCancel:  () => Promise<{ ok: true } | { error: string }>;
}

export function CertificationTotalsPanel({
  status, currency, totalAmount,
  onIssue, onApprove, onReject, onCancel,
}: CertificationTotalsPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ ok: true } | { error: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if ("error" in result) setError(result.error);
    });
  }

  const isTerminal = status === "REJECTED" || status === "CANCELLED";

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <h3 className="text-sm font-semibold">Totales del período</h3>

      <dl className="space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Monto certificado</dt>
          <dd className="font-mono font-semibold">{fmtMoney(totalAmount, currency)}</dd>
        </div>
      </dl>

      {!isTerminal && <Separator />}

      {!isTerminal && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Acciones</p>
          <div className="flex flex-col gap-2">
            {status === "DRAFT" && (
              <Button size="sm" disabled={isPending} onClick={() => run(onIssue)}>
                Emitir certificación
              </Button>
            )}
            {status === "ISSUED" && (
              <>
                <Button size="sm" disabled={isPending} onClick={() => run(onApprove)}>
                  Aprobar
                </Button>
                <Button size="sm" variant="outline" disabled={isPending} onClick={() => run(onReject)}>
                  Rechazar
                </Button>
              </>
            )}
            {(status === "DRAFT" || status === "ISSUED" || status === "APPROVED") && (
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                disabled={isPending}
                onClick={() => {
                  if (confirm("¿Cancelar esta certificación? Esta acción no se puede deshacer.")) {
                    run(onCancel);
                  }
                }}
              >
                Cancelar certificación
              </Button>
            )}
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}
