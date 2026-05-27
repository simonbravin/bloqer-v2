"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatMoneyAmount } from "@/lib/format-money";
import type { BudgetStatus } from "@bloqer/database";

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

async function runLifecycle(
  action: () => Promise<{ ok: true } | { error: string }>,
  successMessage: string,
) {
  const result = await action();
  if ("error" in result) {
    toast.error(result.error);
    return;
  }
  toast.success(successMessage);
}

export function BudgetTotalsPanel({
  status,
  currency,
  totalCost,
  totalSalePrice,
  onSubmitForReview,
  onReturnForChanges,
  onApprove,
  onClose,
  onCancel,
}: BudgetTotalsPanelProps) {
  const [isPending, startTransition] = useTransition();

  const isTerminal = status === "CLOSED" || status === "CANCELLED";

  function run(
    action: () => Promise<{ ok: true } | { error: string }>,
    successMessage: string,
  ) {
    startTransition(() => runLifecycle(action, successMessage));
  }

  return (
    <Card className="rounded-xl border bg-card shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Ciclo de vida</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isTerminal ? (
          <div className="flex flex-col gap-2">
            {(status === "DRAFT" || status === "RETURNED_FOR_CHANGES") && (
              <Button
                size="sm"
                disabled={isPending}
                onClick={() => run(onSubmitForReview, "Presupuesto enviado a revisión")}
              >
                Enviar a revisión
              </Button>
            )}
            {status === "IN_REVIEW" && (
              <>
                <Button
                  size="sm"
                  disabled={isPending}
                  onClick={() => run(onApprove, "Presupuesto aprobado")}
                >
                  Aprobar presupuesto
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => run(onReturnForChanges, "Devuelto con observaciones")}
                >
                  Devolver con observaciones
                </Button>
              </>
            )}
            {status === "APPROVED" && (
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => run(onClose, "Presupuesto cerrado")}
              >
                Cerrar presupuesto
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              disabled={isPending}
              onClick={() => {
                if (confirm("¿Cancelar este presupuesto? Esta acción no se puede deshacer.")) {
                  run(onCancel, "Presupuesto cancelado");
                }
              }}
            >
              Cancelar presupuesto
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Este presupuesto está en estado final y no admite más cambios.
          </p>
        )}

        <Separator />

        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Costo directo</dt>
            <dd className="font-mono font-medium tabular-nums text-right">
              {formatMoneyAmount(totalCost, currency)}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Venta total</dt>
            <dd className="font-mono font-semibold tabular-nums text-right">
              {formatMoneyAmount(totalSalePrice, currency)}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
