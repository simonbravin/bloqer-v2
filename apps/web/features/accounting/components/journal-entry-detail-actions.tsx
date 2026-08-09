"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmAlertDialog } from "@/components/ui/reason-alert-dialog";
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
  const [confirm, setConfirm] = useState<"cancel" | "reverse" | null>(null);

  if (status !== "DRAFT" && !(status === "POSTED" && canReverse)) return null;

  function runPost() {
    setErr(null);
    start(async () => {
      const res = await postJournalEntryAction({ id: entryId });
      if ("error" in res) {
        setErr(res.error);
        toast.error(res.error);
      } else {
        toast.success("Asiento contabilizado");
        router.refresh();
      }
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
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              setErr(null);
              setConfirm("cancel");
            }}
          >
            Anular borrador
          </Button>
        </>
      ) : null}
      {status === "POSTED" && canReverse ? (
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => {
            setErr(null);
            setConfirm("reverse");
          }}
        >
          Revertir asiento
        </Button>
      ) : null}

      <ConfirmAlertDialog
        open={confirm === "cancel"}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title="Anular borrador"
        description={
          <div className="space-y-2">
            <p>El asiento en borrador se anulará y dejará de poder contabilizarse.</p>
            {err ? (
              <p className="text-destructive" role="alert">
                {err}
              </p>
            ) : null}
          </div>
        }
        confirmLabel="Anular"
        variant="destructive"
        pending={pending}
        onConfirm={() => {
          start(async () => {
            setErr(null);
            const res = await cancelJournalEntryAction({ id: entryId });
            if ("error" in res) {
              setErr(res.error);
              toast.error(res.error);
              return;
            }
            setConfirm(null);
            toast.success("Borrador anulado");
            router.refresh();
          });
        }}
      />

      <ConfirmAlertDialog
        open={confirm === "reverse"}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title="Revertir asiento"
        description={
          <div className="space-y-2">
            <p>Se creará un asiento de reversión. Confirmá que la fecha y el período lo permiten.</p>
            {err ? (
              <p className="text-destructive" role="alert">
                {err}
              </p>
            ) : null}
          </div>
        }
        confirmLabel="Revertir"
        variant="destructive"
        pending={pending}
        onConfirm={() => {
          start(async () => {
            setErr(null);
            const res = await reverseJournalEntryAction({ id: entryId });
            if ("error" in res) {
              setErr(res.error);
              toast.error(res.error);
              return;
            }
            setConfirm(null);
            if ("reverseId" in res) {
              toast.success("Asiento revertido");
              router.push(`/contabilidad/asientos/${res.reverseId}`);
            }
          });
        }}
      />
    </div>
  );
}
