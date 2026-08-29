"use client";

import { LayoutGrid, List } from "lucide-react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useHasMounted, useIsMdUp } from "@/lib/media-query";
import {
  LIST_VIEW_CHANGE_EVENT,
  persistListView,
  readStoredListView,
  resolveListViewMode,
  type ListViewMode,
} from "@/lib/list-view-mode";

export type { ListViewMode };

/**
 * Shared by `ListViewToggle` and list sections so mobile defaults to cards
 * without duplicating `if (mobile)` on every page. Pass `defaultView` to
 * change the desktop fallback (e.g. proyectos → cards).
 */
export function useListViewMode(
  param = "view",
  defaultView: ListViewMode = "table",
): ListViewMode {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hasMounted = useHasMounted();
  const isMdUp = useIsMdUp();
  const [stored, setStored] = useState<ListViewMode | null>(null);

  useEffect(() => {
    const sync = () => setStored(readStoredListView(pathname, isMdUp));
    sync();
    window.addEventListener(LIST_VIEW_CHANGE_EVENT, sync);
    return () => window.removeEventListener(LIST_VIEW_CHANGE_EVENT, sync);
  }, [pathname, isMdUp]);

  const urlView = searchParams.get(param);
  if (!hasMounted) {
    return resolveListViewMode({ urlView, stored: null, isMdUp: true, defaultView });
  }
  return resolveListViewMode({ urlView, stored, isMdUp, defaultView });
}

export function ListViewToggle({
  param = "view",
  defaultView = "table",
  storageKey: _storageKey,
  className,
}: {
  param?: string;
  /** Desktop default when there is no URL/storage. Mobile uses cards via `useListViewMode`. */
  defaultView?: ListViewMode;
  /** Kept for call-site compatibility. Persistence is pathname + breakpoint. */
  storageKey?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isMdUp = useIsMdUp();
  const hasMounted = useHasMounted();
  const view = useListViewMode(param, defaultView);
  void _storageKey;

  const setView = useCallback(
    (next: ListViewMode) => {
      const params = new URLSearchParams(searchParams.toString());
      const implicitDefault: ListViewMode = isMdUp ? defaultView : "cards";
      if (next === implicitDefault) params.delete(param);
      else params.set(param, next);
      persistListView(pathname, isMdUp, next);
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname);
    },
    [router, pathname, searchParams, param, isMdUp, defaultView],
  );

  return (
    <div
      className={cn(
        "inline-flex w-fit rounded-lg border border-border/80 bg-muted/30 p-0.5",
        className,
      )}
      role="group"
      aria-label="Vista de listado"
    >
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={cn(
          "h-11 min-h-11 gap-1.5 rounded-md px-2.5 text-xs font-medium md:h-8 md:min-h-8",
          view === "table" && "bg-background text-foreground shadow-sm",
        )}
        aria-pressed={view === "table"}
        disabled={!hasMounted}
        onClick={() => setView("table")}
      >
        <List className="size-3.5" aria-hidden />
        Tabla
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={cn(
          "h-11 min-h-11 gap-1.5 rounded-md px-2.5 text-xs font-medium md:h-8 md:min-h-8",
          view === "cards" && "bg-background text-foreground shadow-sm",
        )}
        aria-pressed={view === "cards"}
        disabled={!hasMounted}
        onClick={() => setView("cards")}
      >
        <LayoutGrid className="size-3.5" aria-hidden />
        Tarjetas
      </Button>
    </div>
  );
}
