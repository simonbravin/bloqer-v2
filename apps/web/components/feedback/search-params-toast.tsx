"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

function SearchParamsToastInner() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const consumed = useRef(false);

  useEffect(() => {
    const ok = searchParams.get("ok");
    const err = searchParams.get("err");
    if (!ok && !err) {
      consumed.current = false;
      return;
    }
    if (consumed.current) return;
    consumed.current = true;

    if (ok === "cancelled") toast.success("Invitación cancelada.");
    else if (ok) toast.success("Cambios guardados.");
    if (err) {
      let msg = err;
      try {
        msg = decodeURIComponent(err);
      } catch {
        /* keep raw */
      }
      toast.error(msg);
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete("ok");
    params.delete("err");
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname);
  }, [searchParams, pathname, router]);

  return null;
}

/** Shows Sonner toasts for `?ok=` / `?err=` then strips those params from the URL. */
export function SearchParamsToast() {
  return (
    <Suspense fallback={null}>
      <SearchParamsToastInner />
    </Suspense>
  );
}
