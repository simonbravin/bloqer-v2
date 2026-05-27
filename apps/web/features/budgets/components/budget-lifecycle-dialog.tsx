"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import type { BudgetStatus } from "@bloqer/database";

interface BudgetLifecycleDialogProps {
  status: BudgetStatus;
  triggerLabel?: string;
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
    return false;
  }
  toast.success(successMessage);
  return true;
}

export function BudgetLifecycleDialog({
  status,
  triggerLabel = "Ciclo de vida",
  onSubmitForReview,
  onReturnForChanges,
  onApprove,
  onClose,
  onCancel,
}: BudgetLifecycleDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isTerminal = status === "CLOSED" || status === "CANCELLED";

  function run(
    action: () => Promise<{ ok: true } | { error: string }>,
    successMessage: string,
  ) {
    startTransition(async () => {
      const ok = await runLifecycle(action, successMessage);
      if (ok) {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Ciclo de vida del presupuesto</DialogTitle>
        </DialogHeader>

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
            <Separator />
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
      </DialogContent>
    </Dialog>
  );
}
