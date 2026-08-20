"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  readViewportHintFromDocument,
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
      writeViewportHintCookie(next);
      if (readViewportHintFromDocument() !== next) return;
      if (prev === next) return;

      const isDashboard = pathname === "/dashboard";
      const isCronograma = pathname.includes("/cronograma");
      const isMateriales = pathname.includes("/materiales");
      const isCuentasPorPagar = pathname.includes("/cuentas-por-pagar");
      const isCuentasPorCobrar = pathname.includes("/cuentas-por-cobrar");
      const fieldSourceChanged = (prev === "lg") !== (next === "lg");

      if (isDashboard) {
        router.refresh();
        return;
      }
      if (isCronograma || isMateriales || isCuentasPorPagar || isCuentasPorCobrar) {
        if (fieldSourceChanged) router.refresh();
        return;
      }
      if (prev !== null) {
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
