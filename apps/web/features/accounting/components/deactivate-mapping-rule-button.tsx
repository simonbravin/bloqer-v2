"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmAlertDialog } from "@/components/ui/reason-alert-dialog";
import { deactivateAccountingMappingRuleAction } from "@/app/(app)/contabilidad/actions";

export function DeactivateMappingRuleButton({
  ruleId,
  ruleCompanyId,
}: {
  ruleId: string;
  ruleCompanyId: string;
}) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-2">
      {err && <p className="text-sm text-destructive">{err}</p>}
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setOpen(true)}>
        Desactivar regla
      </Button>
      <ConfirmAlertDialog
        open={open}
        onOpenChange={setOpen}
        title="Desactivar regla de mapeo"
        description={
          <div className="space-y-2">
            <p>La regla dejará de usarse en nuevos asientos automáticos. El historial no se altera.</p>
            {err ? (
              <p className="text-destructive" role="alert">
                {err}
              </p>
            ) : null}
          </div>
        }
        confirmLabel="Desactivar"
        variant="destructive"
        pending={pending}
        onConfirm={() => {
          start(async () => {
            setErr(null);
            const res = await deactivateAccountingMappingRuleAction(ruleId, ruleCompanyId);
            if ("error" in res) {
              setErr(res.error);
              toast.error(res.error);
              return;
            }
            setOpen(false);
            toast.success("Regla desactivada");
            router.refresh();
          });
        }}
      />
    </div>
  );
}
