export type SortDir = "asc" | "desc";

function isEmptySortValue(v: string | number | null | undefined): boolean {
  return v == null || (typeof v === "number" && Number.isNaN(v));
}

/** Pure comparator used by `useClientTableSort` (null/NaN always last). */
export function compareSortValues(
  av: string | number | null | undefined,
  bv: string | number | null | undefined,
  sortDir: SortDir,
): number {
  const aEmpty = isEmptySortValue(av);
  const bEmpty = isEmptySortValue(bv);
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  let cmp: number;
  if (typeof av === "number" && typeof bv === "number") {
    cmp = av - bv;
  } else {
    cmp = String(av).localeCompare(String(bv), "es", {
      numeric: true,
      sensitivity: "base",
    });
  }
  return sortDir === "asc" ? cmp : -cmp;
}

export function sortRowsByAccessor<T>(
  rows: T[],
  accessor: (row: T) => string | number | null | undefined,
  sortDir: SortDir,
): T[] {
  const copy = [...rows];
  copy.sort((a, b) => compareSortValues(accessor(a), accessor(b), sortDir));
  return copy;
}
