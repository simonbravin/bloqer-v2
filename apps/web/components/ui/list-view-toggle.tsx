"use client";

import { LayoutGrid, List } from "lucide-react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ListViewMode = "table" | "cards";

function storageId(pathname: string, storageKey?: string) {
  return storageKey ?? `bloqer:list-view:${pathname}`;
}

export function ListViewToggle({
  param = "view",
  defaultView = "table",
  storageKey,
  className,
}: {
  param?: string;
  defaultView?: ListViewMode;
  /** Persist preference in localStorage (per pathname or custom key). */
  storageKey?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hydrated = useRef(false);
  const current = (searchParams.get(param) as ListViewMode | null) ?? defaultView;
  const view: ListViewMode = current === "cards" ? "cards" : "table";

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    if (searchParams.has(param)) return;
    try {
      const stored = localStorage.getItem(storageId(pathname, storageKey));
      if (stored === "cards" || stored === "table") {
        const params = new URLSearchParams(searchParams.toString());
        if (stored === defaultView) params.delete(param);
        else params.set(param, stored);
        router.replace(`${pathname}?${params.toString()}`);
      }
    } catch {
      /* private mode */
    }
  }, [pathname, searchParams, param, defaultView, router, storageKey]);

  const setView = useCallback(
    (next: ListViewMode) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === defaultView) params.delete(param);
      else params.set(param, next);
      try {
        localStorage.setItem(storageId(pathname, storageKey), next);
      } catch {
        /* ignore */
      }
      router.replace(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams, param, defaultView, storageKey],
  );

  return (
    <div
      className={cn(
        "inline-flex rounded-lg border border-border/80 bg-muted/30 p-0.5",
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
          "h-8 gap-1.5 rounded-md px-2.5 text-xs font-medium",
          view === "table" && "bg-background text-foreground shadow-sm",
        )}
        aria-pressed={view === "table"}
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
          "h-8 gap-1.5 rounded-md px-2.5 text-xs font-medium",
          view === "cards" && "bg-background text-foreground shadow-sm",
        )}
        aria-pressed={view === "cards"}
        onClick={() => setView("cards")}
      >
        <LayoutGrid className="size-3.5" aria-hidden />
        Tarjetas
      </Button>
    </div>
  );
}
