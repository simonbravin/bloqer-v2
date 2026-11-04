"use client";

import { useEffect, useRef, useState } from "react";

type ConfirmationActionOptions = {
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Keeps a confirmation recoverable after failure and locked while its action is running. */
export function useConfirmationAction({
  open,
  pending,
  onOpenChange,
}: ConfirmationActionOptions) {
  const running = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const busy = pending || submitting;

  useEffect(() => {
    if (open) setActionError(null);
  }, [open]);

  function isBusy() {
    return pending || running.current;
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && isBusy()) return;
    setActionError(null);
    onOpenChange(nextOpen);
  }

  async function confirmAction(action: () => void | Promise<unknown>) {
    if (isBusy()) return;
    running.current = true;
    setSubmitting(true);
    setActionError(null);
    try {
      await action();
    } catch {
      setActionError("No se pudo completar la acción. Volvé a intentar.");
    } finally {
      running.current = false;
      setSubmitting(false);
    }
  }

  return { busy, actionError, isBusy, handleOpenChange, confirmAction };
}
