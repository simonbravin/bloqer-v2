"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmAlertDialog } from "@/components/ui/reason-alert-dialog";
import { deactivateTreasuryAccountAction } from "@/app/(app)/tesoreria/actions";

type Props = {
  accountId: string;
};

export function DeactivateTreasuryAccountButton({ accountId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        Desactivar
      </Button>
      <ConfirmAlertDialog
        open={open}
        onOpenChange={setOpen}
        title="Desactivar cuenta"
        description={
          <div className="space-y-2">
            <p>
              La cuenta dejará de aparecer en formularios de cobro, pago y transferencias. El
              historial de movimientos se conserva.
            </p>
            {error ? (
              <p className="text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        }
        confirmLabel="Desactivar"
        variant="destructive"
        pending={pending}
        onConfirm={() => {
          startTransition(async () => {
            setError(null);
            const res = await deactivateTreasuryAccountAction(accountId);
            if (res && typeof res === "object" && "error" in res) {
              setError(String(res.error));
              return;
            }
            setOpen(false);
            router.refresh();
          });
        }}
      />
    </>
  );
}
