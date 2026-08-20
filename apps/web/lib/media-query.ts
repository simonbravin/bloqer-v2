"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/** Tailwind `md` — sidebar overlay vs rail, list cards default. */
export const MD_UP_QUERY = "(min-width: 768px)";
/** Tailwind `lg` — Gantt mount threshold. */
export const LG_UP_QUERY = "(min-width: 1024px)";

/**
 * False on the server and the first client paint so conditional mounts
 * (e.g. Gantt) do not hydrate-mismatch.
 */
export function useHasMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}

function subscribeToMediaQuery(query: string, onStoreChange: () => void) {
  const mq = window.matchMedia(query);
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

/**
 * CSS-first rule: prefer Tailwind. Use this only when render/behavior must change
 * (do not mount Gantt, list default, sidebar toggle target).
 *
 * `serverSnapshot` should match the desktop-first SSR of Bloqer (typically `true`
 * for min-width queries). Do not branch visible layout on this during SSR —
 * gate with `useHasMounted` when markup would differ.
 */
export function useMediaQuery(query: string, serverSnapshot = false): boolean {
  return useSyncExternalStore(
    (onStoreChange) => subscribeToMediaQuery(query, onStoreChange),
    () => window.matchMedia(query).matches,
    () => serverSnapshot,
  );
}

export function useIsMdUp(): boolean {
  return useMediaQuery(MD_UP_QUERY, true);
}

export function useIsLgUp(): boolean {
  return useMediaQuery(LG_UP_QUERY, true);
}
