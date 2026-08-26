"use client";

import { useState, useTransition } from "react";
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

type Props = {
  poId: string;
  projectId: string;
};

export function PurchaseOrderApprovalActions({ poId, projectId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [approveOpen, setApproveOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function approve() {
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
    <>
      {error ? (
        <p className="w-full rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        className="min-h-11 w-full sm:w-auto md:min-h-9"
        data-testid="po-approve-button"
        disabled={pending}
        onClick={() => setApproveOpen(true)}
      >
        Aprobar
      </Button>
      <Button
        type="button"
        variant="outline"
        className="min-h-11 w-full sm:w-auto md:min-h-9"
        data-testid="po-return-button"
        disabled={pending}
        onClick={() => setReturnOpen(true)}
      >
        Devolver
      </Button>

      <AlertDialog open={approveOpen} onOpenChange={setApproveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Aprobar esta orden?</AlertDialogTitle>
            <AlertDialogDescription>
              La OC pasará a aprobada. Esta acción usa el workflow actual de compras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11 md:min-h-9" disabled={pending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 md:min-h-9"
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                approve();
              }}
            >
              {pending ? "Aprobando…" : "Aprobar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={returnOpen} onOpenChange={setReturnOpen}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-xl">
          <SheetHeader className="text-left">
            <SheetTitle>Devolver a borrador</SheetTitle>
            <SheetDescription>
              Indicá el motivo. Es obligatorio para devolver la orden.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            <Label htmlFor="po-return-reason">Motivo</Label>
            <Textarea
              id="po-return-reason"
              data-testid="po-return-reason"
              value={reason}
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
                className="min-h-11 md:min-h-9"
                disabled={pending}
                onClick={() => setReturnOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className="min-h-11 md:min-h-9"
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
    </>
  );
}
