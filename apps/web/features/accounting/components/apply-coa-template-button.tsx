"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { applyArgentineCoaTemplateAction } from "@/app/(app)/contabilidad/actions";

export function ApplyCoaTemplateButton({ companyId }: { companyId?: string | null }) {
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
      setMsg(
        `Plantilla aplicada: ${res.accountsCreated} cuentas nuevas, ${res.rulesCreated} reglas nuevas.`,
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" disabled={pending} onClick={run}>
        Aplicar plantilla AR
      </Button>
      {err ? <p className="text-xs text-destructive">{err}</p> : null}
      {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
    </div>
  );
}
