"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmAlertDialog } from "@/components/ui/reason-alert-dialog";
import { applyArgentineCoaTemplateAction } from "@/app/(app)/contabilidad/actions";

export function ApplyCoaTemplateButton({
  companyId,
  companyLabel,
}: {
  companyId?: string | null;
  /** Shown when multi-company fallback may surprise the user. */
  companyLabel?: string | null;
}) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(true)}>
        Aplicar plantilla AR
      </Button>
      {companyLabel ? (
        <p className="text-xs text-muted-foreground">Se aplica a: {companyLabel}</p>
      ) : null}
      {err ? <p className="text-xs text-destructive">{err}</p> : null}
      {msg ? <p className="text-xs text-muted-foreground max-w-sm text-right">{msg}</p> : null}

      <ConfirmAlertDialog
        open={open}
        onOpenChange={setOpen}
        title="Aplicar plan de cuentas AR"
        description={
          <div className="space-y-2">
            <p>
              Se crearán o reactivarán cuentas y reglas de mapeo
              {companyLabel ? ` para ${companyLabel}` : " para la empresa activa"}. No duplica códigos
              existentes.
            </p>
            {err ? (
              <p className="text-destructive" role="alert">
                {err}
              </p>
            ) : null}
          </div>
        }
        confirmLabel="Aplicar plantilla"
        pending={pending}
        onConfirm={() => {
          start(async () => {
            setErr(null);
            setMsg(null);
            const res = await applyArgentineCoaTemplateAction({ companyId: companyId ?? null });
            if ("error" in res) {
              setErr(res.error);
              toast.error(res.error);
              return;
            }
            const parts = [`Plantilla aplicada: ${res.accountsCreated} cuentas nuevas`];
            if (res.accountsReactivated) {
              parts.push(`${res.accountsReactivated} reactivadas`);
            }
            if (res.accountsSkipped) {
              parts.push(`${res.accountsSkipped} ya existían (sin duplicar)`);
            }
            parts.push(
              `${res.rulesCreated} reglas nuevas` +
                (res.rulesSkipped ? ` (${res.rulesSkipped} ya activas)` : ""),
            );
            const summary = parts.join("; ") + ".";
            setMsg(summary);
            setOpen(false);
            toast.success(summary);
            router.refresh();
          });
        }}
      />
    </div>
  );
}
