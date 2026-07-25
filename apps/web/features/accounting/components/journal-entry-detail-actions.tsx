"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  cancelJournalEntryAction,
  postJournalEntryAction,
  reverseJournalEntryAction,
} from "@/app/(app)/contabilidad/actions";
import type { JournalEntryStatus } from "@bloqer/database";

export function JournalEntryDetailActions({
  entryId,
  status,
  canReverse = false,
}: {
  entryId: string;
  status: JournalEntryStatus;
  canReverse?: boolean;
}) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (status !== "DRAFT" && !(status === "POSTED" && canReverse)) return null;

  function runPost() {
    setErr(null);
    start(async () => {
      const res = await postJournalEntryAction({ id: entryId });
      if ("error" in res) setErr(res.error);
      else router.refresh();
    });
  }

  function runCancel() {
    setErr(null);
    start(async () => {
      const res = await cancelJournalEntryAction({ id: entryId });
      if ("error" in res) setErr(res.error);
      else router.refresh();
    });
  }

  function runReverse() {
    setErr(null);
    start(async () => {
      const res = await reverseJournalEntryAction({ id: entryId });
      if ("error" in res) setErr(res.error);
      else if ("reverseId" in res) router.push(`/contabilidad/asientos/${res.reverseId}`);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {err && <p className="text-sm text-destructive">{err}</p>}
      {status === "DRAFT" ? (
        <>
          <Button type="button" disabled={pending} onClick={runPost}>
            Contabilizar
          </Button>
          <Button type="button" variant="outline" disabled={pending} onClick={runCancel}>
            Anular borrador
          </Button>
        </>
      ) : null}
      {status === "POSTED" && canReverse ? (
        <Button type="button" variant="outline" disabled={pending} onClick={runReverse}>
          Revertir asiento
        </Button>
      ) : null}
    </div>
  );
}
