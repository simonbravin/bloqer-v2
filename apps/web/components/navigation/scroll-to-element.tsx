"use client";

import { useEffect } from "react";

/** Soft-scroll to an element after App Router navigation (hash alone is unreliable). */
export function ScrollToElement({ id }: { id: string }) {
  useEffect(() => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [id]);
  return null;
}
