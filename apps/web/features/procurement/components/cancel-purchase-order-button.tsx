"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmAlertDialog } from "@/components/ui/reason-alert-dialog";
import { cancelPurchaseOrderAction } from "@/app/(app)/proyectos/[id]/ordenes-compra/actions";

export function CancelPurchaseOrderButton({
  poId,
  projectId,
  className,
}: {
  poId: string;
  projectId: string;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        className={className}
        onClick={() => setOpen(true)}
      >
        Anular
      </Button>
      <ConfirmAlertDialog
        open={open}
        onOpenChange={setOpen}
        title="Anular orden de compra"
        description={
          <div className="space-y-2">
            <p>La OC pasará a anulada. No se podrá confirmar ni recibir contra ella.</p>
            {error ? (
              <p className="text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        }
        confirmLabel="Anular OC"
        variant="destructive"
        pending={pending}
        onConfirm={() => {
          startTransition(async () => {
            setError(null);
            const res = await cancelPurchaseOrderAction(poId, projectId);
            if ("error" in res) {
              setError(res.error);
              toast.error(res.error);
              return;
            }
            setOpen(false);
            toast.success("Orden de compra anulada");
            router.refresh();
          });
        }}
      />
    </>
  );
}
