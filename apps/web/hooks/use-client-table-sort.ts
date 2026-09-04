"use client";

import { useMemo, useState } from "react";
import { sortRowsByAccessor, type SortDir } from "./client-table-sort";

export type { SortDir } from "./client-table-sort";

export function useClientTableSort<T>(
  rows: T[],
  accessors: Record<string, (row: T) => string | number | null | undefined>,
  defaultKey?: string,
) {
  const [sortKey, setSortKey] = useState<string | null>(defaultKey ?? null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const sorted = useMemo(() => {
    if (!sortKey || !accessors[sortKey]) return rows;
    return sortRowsByAccessor(rows, accessors[sortKey]!, sortDir);
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
