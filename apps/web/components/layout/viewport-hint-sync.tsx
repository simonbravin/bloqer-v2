"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  readViewportHintFromDocument,
  shouldRefreshForViewport,
  VIEWPORT_LG_QUERY,
  VIEWPORT_MD_QUERY,
  viewportHintFromMatchMedia,
  writeViewportHintCookie,
  type ViewportHint,
} from "@/lib/viewport-hint-cookie";

/** Writes `bloqer-viewport` from matchMedia. Convenience for RSC trees — not auth. */
export function ViewportHintSync() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const mdMq = window.matchMedia(VIEWPORT_MD_QUERY);
    const lgMq = window.matchMedia(VIEWPORT_LG_QUERY);
    const sync = () => {
      const next: ViewportHint = viewportHintFromMatchMedia(mdMq.matches, lgMq.matches);
      const prev = readViewportHintFromDocument();
      if (prev === next) return;
      writeViewportHintCookie(next);
      if (readViewportHintFromDocument() === next && shouldRefreshForViewport(pathname, prev, next)) {
        router.refresh();
      }
    };
    sync();
    mdMq.addEventListener("change", sync);
    lgMq.addEventListener("change", sync);
    return () => {
      mdMq.removeEventListener("change", sync);
      lgMq.removeEventListener("change", sync);
    };
  }, [pathname, router]);

  return null;
}
