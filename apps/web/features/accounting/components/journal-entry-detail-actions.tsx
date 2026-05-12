"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cancelJournalEntryAction, postJournalEntryAction } from "@/app/(app)/contabilidad/actions";
import type { JournalEntryStatus } from "@bloqer/database";

export function JournalEntryDetailActions({
  entryId,
  status,
}: {
  entryId: string;
  status:  JournalEntryStatus;
}) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (status !== "DRAFT") return null;

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

  return (
    <div className="flex flex-wrap items-center gap-3">
      {err && <p className="text-sm text-destructive">{err}</p>}
      <Button type="button" disabled={pending} onClick={runPost}>Contabilizar</Button>
      <Button type="button" variant="outline" disabled={pending} onClick={runCancel}>Anular borrador</Button>
    </div>
  );
}
