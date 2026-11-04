"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmAlertDialog } from "@/components/ui/reason-alert-dialog";
import { ManualFxField } from "@/features/finance/components/manual-fx-field";
import { confirmPurchaseOrderAction } from "@/app/(app)/proyectos/[id]/ordenes-compra/actions";
import { useProcurementAction } from "../lib/use-procurement-action";

export function ConfirmPurchaseOrderButton({ poId, projectId, currency, initialFxRate, className }: {
  poId: string; projectId: string; currency: string; initialFxRate: string; className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fxRate, setFxRate] = useState(initialFxRate);
  const [error, setError] = useState<string | null>(null);
  const { pending, run, isRunning } = useProcurementAction();
  return <>
    <Button type="button" className={className} disabled={pending} onClick={() => setOpen(true)}>Confirmar al proveedor</Button>
    <ConfirmAlertDialog open={open} onOpenChange={(next) => { if (!isRunning()) setOpen(next); }} pending={pending}
      title="Confirmar al proveedor" confirmLabel="Confirmar OC"
      description={<div className="space-y-3">
        <p>La OC compromete el costo y queda disponible para recibir y facturar. Moneda: {currency}.</p>
        <ManualFxField id="confirm-po-fx" currency={currency} value={fxRate} onValueChange={setFxRate} disabled={pending} />
        {currency !== "ARS" ? <p className="text-xs text-muted-foreground">
          Si cambiás el tipo de cambio aprobado, necesitás poder aprobar el nuevo importe; si no, debe revisarlo un aprobador habilitado.
        </p> : null}
        {error ? <p className="text-destructive" role="alert">{error}</p> : null}
      </div>}
      onConfirm={() => run(async () => {
        setError(null);
        if (currency !== "ARS" && !fxRate.trim()) { setError("Ingresá el tipo de cambio de esta operación"); return; }
        const result = await confirmPurchaseOrderAction(poId, projectId, { fxRate: currency === "ARS" ? undefined : fxRate });
        if ("error" in result) { setError(result.error); return; }
        setOpen(false); router.refresh();
      })}
    />
  </>;
}
