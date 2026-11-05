"use client";

import { useCallback, useRef, useTransition } from "react";
import { toast } from "sonner";

export const OPERATION_CONNECTION_ERROR =
  "No se pudo comprobar el resultado. Revisá el estado antes de volver a intentar.";

/** Locks before rerender and keeps an uncertain mutation recoverable after a transport error. */
export function useOperationalAction(
  options: {
    onPendingChange?: (pending: boolean) => void;
    onError?: (message: string) => void;
  } = {},
) {
  const running = useRef(false);
  const [pending, startTransition] = useTransition();
  const { onPendingChange, onError } = options;
  const run = useCallback(
    (action: () => void | Promise<unknown>) => {
      if (running.current) return Promise.resolve();
      running.current = true;
      onPendingChange?.(true);
      let finish!: () => void;
      const completion = new Promise<void>((resolve) => {
        finish = resolve;
      });
      startTransition(async () => {
        try {
          await action();
        } catch {
          if (onError) onError(OPERATION_CONNECTION_ERROR);
          else toast.error(OPERATION_CONNECTION_ERROR);
        } finally {
          running.current = false;
          onPendingChange?.(false);
          finish();
        }
      });
      return completion;
    },
    [onError, onPendingChange, startTransition],
  );
  const isBusy = useCallback(() => running.current || pending, [pending]);
  return { pending, run, isBusy };
}
