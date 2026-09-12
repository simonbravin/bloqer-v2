"use client";

import { useEffect } from "react";

/** Soft-scroll to an element after App Router navigation (hash alone is unreliable). */
export function ScrollToElement({ id }: { id: string }) {
  useEffect(() => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    if (el instanceof HTMLElement) {
      if (!el.hasAttribute("tabindex")) el.tabIndex = -1;
      el.focus({ preventScroll: true });
    }
  }, [id]);
  return null;
}

/** Same as ScrollToElement but reads `window.location.hash` (e.g. /politicas#notificaciones). */
export function ScrollToHash() {
  useEffect(() => {
    const raw = window.location.hash.replace(/^#/, "").trim();
    if (!raw) return;
    // Allow one paint so section ids from the RSC tree are in the DOM.
    const t = window.setTimeout(() => {
      const el = document.getElementById(raw);
      if (!el) return;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      if (el instanceof HTMLElement) {
        if (!el.hasAttribute("tabindex")) el.tabIndex = -1;
        el.focus({ preventScroll: true });
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}
