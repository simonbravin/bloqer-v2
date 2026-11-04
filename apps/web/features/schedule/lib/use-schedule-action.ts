"use client";

import { useCallback, useRef, useTransition } from "react";
import { toast } from "sonner";

/** Lock before the next render, retain React's refresh transition and allow retries. */
export function useScheduleAction() {
  const running = useRef(false);
  const [pending, startTransition] = useTransition();

  const run = useCallback((action: () => void | Promise<unknown>, onFailure?: () => void) => {
    if (running.current) return;
    running.current = true;
    startTransition(async () => {
      try {
        await action();
      } catch {
        onFailure?.();
        toast.error("No se pudo completar la acción. Volvé a intentar.");
      } finally {
        running.current = false;
      }
    });
  }, [startTransition]);

  const isRunning = useCallback(() => running.current || pending, [pending]);
  return { pending, run, isRunning };
}
