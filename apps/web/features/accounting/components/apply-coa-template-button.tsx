"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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

  function run() {
    setErr(null);
    setMsg(null);
    start(async () => {
      const res = await applyArgentineCoaTemplateAction({ companyId: companyId ?? null });
      if ("error" in res) {
        setErr(res.error);
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
      setMsg(parts.join("; ") + ".");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" disabled={pending} onClick={run}>
        Aplicar plantilla AR
      </Button>
      {companyLabel ? (
        <p className="text-xs text-muted-foreground">Se aplica a: {companyLabel}</p>
      ) : null}
      {err ? <p className="text-xs text-destructive">{err}</p> : null}
      {msg ? <p className="text-xs text-muted-foreground max-w-sm text-right">{msg}</p> : null}
    </div>
  );
}
