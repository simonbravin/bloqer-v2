"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

export function useDebouncedSearchParam(
  param: string,
  delayMs = 300,
  options?: { minLength?: number },
) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPending = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const setDebounced = useCallback(
    (value: string) => {
      cancelPending();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const params = new URLSearchParams(searchParams.toString());
        const trimmed = value.trim();
        const minLen = options?.minLength ?? 0;
        if (!trimmed || trimmed.length < minLen) params.delete(param);
        else params.set(param, trimmed);
        params.delete("page");
        const q = params.toString();
        router.replace(q ? `${pathname}?${q}` : pathname);
      }, delayMs);
    },
    [router, pathname, searchParams, param, delayMs, options?.minLength, cancelPending],
  );

  useEffect(() => {
    return cancelPending;
  }, [cancelPending]);

  return {
    defaultValue: searchParams.get(param) ?? "",
    setDebounced,
    cancelPending,
  };
}
