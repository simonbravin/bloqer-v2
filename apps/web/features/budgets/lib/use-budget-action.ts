"use client";

import { useRef, useState } from "react";

export const BUDGET_ACTION_ERROR = "No se pudo completar la acción. Volvé a intentar.";

/** Locks the current interaction before React renders and keeps failed requests recoverable. */
export function useBudgetAction(
  onError: (message: string) => void,
  onPendingChange?: (pending: boolean) => void,
) {
  const running = useRef(false);
  const [isPending, setIsPending] = useState(false);

  async function run(action: () => void | Promise<unknown>) {
    if (running.current) return;
    running.current = true;
    setIsPending(true);
    onPendingChange?.(true);
    try {
      await action();
    } catch {
      onError(BUDGET_ACTION_ERROR);
    } finally {
      running.current = false;
      setIsPending(false);
      onPendingChange?.(false);
    }
  }

  return { isPending, isRunning: () => running.current, run };
}
