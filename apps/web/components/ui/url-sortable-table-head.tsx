"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import type { SortDir } from "@/hooks/use-client-table-sort";

/**
 * Server-driven date column sort via `sort` + `dir` query params.
 * Toggles asc/desc for the given sort key (default `date`).
 */
export function UrlSortableTableHead({
  label,
  sortKey = "date",
  defaultDir = "desc",
  className,
}: {
  label: string;
  sortKey?: string;
  defaultDir?: SortDir;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const urlSort = sp.get("sort");
  const urlDir = sp.get("dir");
  const active = !urlSort || urlSort === sortKey;
  const sortDir: SortDir =
    urlDir === "asc" || urlDir === "desc" ? (urlDir as SortDir) : defaultDir;

  function onSort(key: string) {
    const params = new URLSearchParams(sp.toString());
    params.set("sort", key);
    const wasActive = !urlSort || urlSort === key;
    const currentDir: SortDir =
      urlDir === "asc" || urlDir === "desc" ? (urlDir as SortDir) : defaultDir;
    params.set("dir", wasActive ? (currentDir === "asc" ? "desc" : "asc") : defaultDir);
    params.delete("page");
    const q = params.toString();
    router.push(q ? `${pathname}?${q}` : pathname);
  }

  return (
    <SortableTableHead
      label={label}
      sortKey={sortKey}
      activeKey={active ? sortKey : null}
      sortDir={sortDir}
      onSort={onSort}
      className={className}
    />
  );
}
