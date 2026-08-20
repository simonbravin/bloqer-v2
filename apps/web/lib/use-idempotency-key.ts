"use client";

import { useCallback, useState } from "react";

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

/** Stable UUID for one submit attempt. Rotate after success (or when the file changes). */
export function useIdempotencyKey() {
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  const rotateIdempotencyKey = useCallback(() => {
    const next = newIdempotencyKey();
    setIdempotencyKey(next);
    return next;
  }, []);

  return { idempotencyKey, rotateIdempotencyKey };
}
