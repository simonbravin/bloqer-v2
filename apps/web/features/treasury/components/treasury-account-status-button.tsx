"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmAlertDialog } from "@/components/ui/reason-alert-dialog";
import { closeTreasuryAccountAction, deactivateTreasuryAccountAction } from "@/app/(app)/tesoreria/actions";
import { useOperationalAction } from "@/hooks/use-operational-action";

type Props = {
  accountId: string;
  operation: "deactivate" | "close";
  disabled?: boolean;
};

export function TreasuryAccountStatusButton({ accountId, operation, disabled = false }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useOperationalAction({ onError: setError });
  const close = operation === "close";
  const label = close ? "Cerrar cuenta" : "Desactivar";

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="text-muted-foreground"
        disabled={disabled || pending}
        onClick={() => { setError(null); setOpen(true); }}
      >
        {label}
      </Button>
      <ConfirmAlertDialog
        open={open}
        onOpenChange={setOpen}
        title={close ? "Cerrar cuenta" : "Desactivar cuenta"}
        description={
          <div className="space-y-2">
            <p>
              {close
                ? "El saldo debe ser cero. El cierre es definitivo y se conserva el extracto histórico."
                : "La cuenta dejará de aparecer en formularios de cobro, pago y transferencias. El historial de movimientos se conserva."}
            </p>
            {error ? (
              <p className="text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        }
        confirmLabel={label}
        variant="destructive"
        pending={pending}
        onConfirm={() =>
          run(async () => {
            setError(null);
            const res = close ? await closeTreasuryAccountAction(accountId) : await deactivateTreasuryAccountAction(accountId);
            if (res && typeof res === "object" && "error" in res) {
              setError(String(res.error));
              return;
            }
            setOpen(false);
            router.refresh();
          })
        }
      />
    </>
  );
}
