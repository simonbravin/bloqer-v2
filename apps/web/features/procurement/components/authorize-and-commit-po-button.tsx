"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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
import { authorizeAndCommitPurchaseOrderAction } from "@/app/(app)/proyectos/[id]/ordenes-compra/actions";

type Props = {
  poId: string;
  projectId: string;
  className?: string;
};

/** [D-105] One-step Autorizar y comprometer (policy-gated). */
export function AuthorizeAndCommitPoButton({ poId, projectId, className }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    startTransition(async () => {
      setError(null);
      const res = await authorizeAndCommitPurchaseOrderAction(poId, projectId);
      if ("error" in res) {
        setError(res.error);
        setOpen(false);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex w-full flex-col gap-2 sm:w-auto">
        {error ? (
          <p
            className="w-full rounded-md bg-destructive/10 p-3 text-sm text-destructive"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        <Button
          type="button"
          className={className ?? "min-h-11 w-full sm:w-auto md:min-h-9"}
          data-testid="po-authorize-and-commit-button"
          disabled={pending}
          onClick={() => setOpen(true)}
        >
          Autorizar y comprometer
        </Button>
      </div>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Autorizar y comprometer?</AlertDialogTitle>
            <AlertDialogDescription>
              Un solo paso: autoriza la OC y reserva $ en EDT (queda Confirmada =
              Comprometido). En OC de alto nivel solo administración. Después se puede recibir y
              facturar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                confirm();
              }}
            >
              {pending ? "Procesando…" : "Autorizar y comprometer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
