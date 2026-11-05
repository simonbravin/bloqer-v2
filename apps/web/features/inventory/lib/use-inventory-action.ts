"use client";

import { useCallback, useRef, useTransition } from "react";
import { toast } from "sonner";

export const INVENTORY_CONNECTION_ERROR =
  "No se pudo comprobar el resultado. Revisá el estado antes de volver a intentar.";

/** Protect the interval before rerender and keep drafts recoverable after transport failures. */
export function useInventoryAction(onPendingChange?: (pending: boolean) => void) {
  const running = useRef(false);
  const [pending, startTransition] = useTransition();
  const run = useCallback(
    (action: () => void | Promise<unknown>) => {
      if (running.current) return;
      running.current = true;
      onPendingChange?.(true);
      startTransition(async () => {
        try {
          await action();
        } catch {
          toast.error(INVENTORY_CONNECTION_ERROR);
        } finally {
          running.current = false;
          onPendingChange?.(false);
        }
      });
    },
    [onPendingChange, startTransition],
  );
  const isRunning = useCallback(() => running.current || pending, [pending]);
  return { pending, run, isRunning };
}
