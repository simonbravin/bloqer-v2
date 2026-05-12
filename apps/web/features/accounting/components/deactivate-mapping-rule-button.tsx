"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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

  function run() {
    setErr(null);
    start(async () => {
      const res = await deactivateAccountingMappingRuleAction(ruleId, ruleCompanyId);
      if ("error" in res) setErr(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {err && <p className="text-sm text-destructive">{err}</p>}
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={run}>
        Desactivar regla
      </Button>
    </div>
  );
}
