"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  readViewportHintFromDocument,
  VIEWPORT_MD_QUERY,
  writeViewportHintCookie,
  type ViewportHint,
} from "@/lib/viewport-hint-cookie";

/** Writes `bloqer-viewport` from matchMedia. Convenience for RSC trees — not auth. */
export function ViewportHintSync() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const mq = window.matchMedia(VIEWPORT_MD_QUERY);
    const sync = () => {
      const next: ViewportHint = mq.matches ? "md" : "sm";
      const prev = readViewportHintFromDocument();
      writeViewportHintCookie(next);
      if (readViewportHintFromDocument() !== next) return;
      if (prev === next) return;
      if (pathname === "/dashboard" || prev !== null) {
        router.refresh();
      }
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [pathname, router]);

  return null;
}
