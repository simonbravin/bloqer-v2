"use client";

import { useMemo, useState } from "react";

export type SortDir = "asc" | "desc";

export function useClientTableSort<T>(
  rows: T[],
  accessors: Record<string, (row: T) => string | number | null | undefined>,
  defaultKey?: string,
) {
  const [sortKey, setSortKey] = useState<string | null>(defaultKey ?? null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const sorted = useMemo(() => {
    if (!sortKey || !accessors[sortKey]) return rows;
    const acc = accessors[sortKey]!;
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = acc(a);
      const bv = acc(b);
      const as = av == null ? "" : String(av);
      const bs = bv == null ? "" : String(bv);
      const cmp = as.localeCompare(bs, "es", { numeric: true, sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir, accessors]);

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  return { sorted, sortKey, sortDir, toggleSort };
}
