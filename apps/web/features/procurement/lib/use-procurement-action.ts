"use client";

import { useCallback, useRef, useTransition } from "react";
import { toast } from "sonner";

export const PROCUREMENT_CONNECTION_ERROR = "No se pudo comprobar el resultado. Revisá el estado del documento antes de volver a intentar.";

/** One request before the next render; rejected transport must keep the draft recoverable. */
export function useProcurementAction(onPendingChange?: (pending: boolean) => void) {
  const running = useRef(false);
  const [pending, startTransition] = useTransition();
  const run = useCallback((action: () => void | Promise<unknown>, onFailure?: () => void) => {
    if (running.current) return;
    running.current = true;
    onPendingChange?.(true);
    startTransition(async () => {
      try {
        await action();
      } catch {
        onFailure?.();
        toast.error(PROCUREMENT_CONNECTION_ERROR);
      } finally {
        running.current = false;
        onPendingChange?.(false);
      }
    });
  }, [startTransition, onPendingChange]);
  const isRunning = useCallback(() => running.current || pending, [pending]);
  return { pending, run, isRunning };
}
