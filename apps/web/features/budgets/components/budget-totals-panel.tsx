"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { BudgetStatus } from "@bloqer/database";

function fmt(value: string, currency: string) {
  return (
    new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      parseFloat(value),
    ) +
    " " +
    currency
  );
}

interface BudgetTotalsPanelProps {
  status: BudgetStatus;
  currency: string;
  totalCost: string;
  totalSalePrice: string;
  onSubmitForReview: () => Promise<{ ok: true } | { error: string }>;
  onReturnForChanges: () => Promise<{ ok: true } | { error: string }>;
  onApprove: () => Promise<{ ok: true } | { error: string }>;
  onClose: () => Promise<{ ok: true } | { error: string }>;
  onCancel: () => Promise<{ ok: true } | { error: string }>;
}

export function BudgetTotalsPanel({
  status, currency, totalCost, totalSalePrice,
  onSubmitForReview, onReturnForChanges, onApprove, onClose, onCancel,
}: BudgetTotalsPanelProps) {
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: true } | { error: string }>) {
    startTransition(async () => { await action(); });
  }

  const isTerminal = status === "CLOSED" || status === "CANCELLED";

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <h3 className="text-sm font-semibold">Totales</h3>

      <dl className="space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Costo directo total</dt>
          <dd className="font-mono font-medium">{fmt(totalCost, currency)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Precio de venta total</dt>
          <dd className="font-mono font-semibold text-base">{fmt(totalSalePrice, currency)}</dd>
        </div>
      </dl>

      {!isTerminal && <Separator />}

      {!isTerminal && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Acciones</p>
          <div className="flex flex-col gap-2">
            {(status === "DRAFT" || status === "RETURNED_FOR_CHANGES") && (
              <Button size="sm" disabled={isPending} onClick={() => run(onSubmitForReview)}>
                Enviar a revisión
              </Button>
            )}
            {status === "IN_REVIEW" && (
              <>
                <Button size="sm" disabled={isPending} onClick={() => run(onApprove)}>
                  Aprobar presupuesto
                </Button>
                <Button size="sm" variant="outline" disabled={isPending} onClick={() => run(onReturnForChanges)}>
                  Devolver con observaciones
                </Button>
              </>
            )}
            {status === "APPROVED" && (
              <Button size="sm" variant="outline" disabled={isPending} onClick={() => run(onClose)}>
                Cerrar presupuesto
              </Button>
            )}
            {!isTerminal && (
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                disabled={isPending}
                onClick={() => {
                  if (confirm("¿Cancelar este presupuesto? Esta acción no se puede deshacer.")) {
                    run(onCancel);
                  }
                }}
              >
                Cancelar presupuesto
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
