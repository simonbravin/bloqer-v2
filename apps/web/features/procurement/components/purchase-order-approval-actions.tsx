"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  approvePurchaseOrderAction,
  returnPurchaseOrderAction,
} from "@/app/(app)/proyectos/[id]/ordenes-compra/actions";
import { ActionErrorBanner } from "@/components/feedback/action-error-banner";
import {
  procurementActionBtnClass,
  procurementDialogBtnClass,
} from "../lib/procurement-ui";
import { useProcurementAction } from "../lib/use-procurement-action";

type Props = {
  poId: string;
  projectId: string;
  /** [D-107] When true, approving also confirms (Comprometido) under company policy. */
  willAutoConfirm?: boolean;
  /**
   * When Autorizar y comprometer is also shown on SUBMITTED, demote Aprobar to outline
   * so there is a single primary CTA.
   */
  approveVariant?: "default" | "outline";
  canApprove?: boolean;
  canReturn?: boolean;
};

export function PurchaseOrderApprovalActions({
  poId,
  projectId,
  willAutoConfirm = false,
  approveVariant = "default",
  canApprove = true,
  canReturn = true,
}: Props) {
  const router = useRouter();
  const { pending, run: startTransition, isRunning } = useProcurementAction();
  const [approveOpen, setApproveOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function approve() {
    if (!canApprove) return;
    startTransition(async () => {
      setError(null);
      const res = await approvePurchaseOrderAction(poId, projectId);
      if ("error" in res) {
        setError(res.error);
        setApproveOpen(false);
        return;
      }
      setApproveOpen(false);
      router.refresh();
    });
  }

  function returnPo() {
    if (!canReturn) return;
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      setError("El motivo es obligatorio.");
      return;
    }
    startTransition(async () => {
      setError(null);
      const res = await returnPurchaseOrderAction(poId, projectId, trimmed);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setReturnOpen(false);
      setReason("");
      router.refresh();
    });
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
      <ActionErrorBanner message={error ?? undefined} className="w-full basis-full" />
      {canApprove ? <Button
        type="button"
        variant={approveVariant}
        className={procurementActionBtnClass}
        data-testid="po-approve-button"
        disabled={pending}
        onClick={() => setApproveOpen(true)}
      >
        {willAutoConfirm ? "Aprobar y comprometer" : "Aprobar"}
      </Button> : null}
      {canReturn ? <Button
        type="button"
        variant="outline"
        className={procurementActionBtnClass}
        data-testid="po-return-button"
        disabled={pending}
        onClick={() => setReturnOpen(true)}
      >
        Devolver
      </Button> : null}

      <AlertDialog open={approveOpen} onOpenChange={(open) => { if (!isRunning()) setApproveOpen(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {willAutoConfirm ? "¿Aprobar y comprometer?" : "¿Aprobar esta orden?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {willAutoConfirm
                ? "Con la política activa, al aprobar la OC queda Confirmada = Comprometido (reserva $ en EDT). Después se puede recibir y facturar."
                : "La OC queda Aprobada (control interno). Todavía no reserva $. Después hay que Confirmar al proveedor para comprometer el costo en EDT."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={procurementDialogBtnClass} disabled={pending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className={procurementDialogBtnClass}
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                approve();
              }}
            >
              {pending
                ? willAutoConfirm
                  ? "Procesando…"
                  : "Aprobando…"
                : willAutoConfirm
                  ? "Aprobar y comprometer"
                  : "Aprobar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={returnOpen} onOpenChange={(open) => { if (!isRunning()) setReturnOpen(open); }}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-xl">
          <SheetHeader className="text-left">
            <SheetTitle>Devolver a borrador</SheetTitle>
            <SheetDescription>
              Indicá el motivo. Es obligatorio para devolver la orden.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            <ActionErrorBanner message={error ?? undefined} />
            <Label htmlFor="po-return-reason">Motivo</Label>
            <Textarea
              id="po-return-reason"
              data-testid="po-return-reason"
              value={reason}
              disabled={pending}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={3}
              rows={5}
              className="min-h-32 w-full"
              placeholder="Indicá el motivo…"
            />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className={procurementDialogBtnClass}
                disabled={pending}
                onClick={() => setReturnOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className={procurementDialogBtnClass}
                data-testid="po-return-confirm"
                disabled={pending}
                onClick={returnPo}
              >
                {pending ? "Devolviendo…" : "Devolver"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
