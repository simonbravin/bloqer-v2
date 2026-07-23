"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { markNotificationReadAction } from "@/app/(app)/notificaciones/actions";
import { safeActionHref } from "@/lib/safe-action-href";
import { cn } from "@/lib/utils";

const POLL_MS = 30_000;

type BellItem = {
  id: string;
  title: string;
  body: string;
  severity: string;
  status: string;
  createdAt: string;
  actionUrl: string | null;
};

type BellSnapshot = {
  unreadCount: number;
  items: BellItem[];
};

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function NotificationBell({ initialUnreadCount = 0 }: { initialUnreadCount?: number }) {
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [items, setItems] = useState<BellItem[]>([]);
  const [open, setOpen] = useState(false);
  const mountedRef = useRef(true);
  const fetchGenRef = useRef(0);

  const refresh = useCallback(async () => {
    const gen = ++fetchGenRef.current;
    try {
      const res = await fetch("/api/notifications/bell", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!res.ok || !mountedRef.current || gen !== fetchGenRef.current) return;
      const data = (await res.json()) as BellSnapshot;
      if (!mountedRef.current || gen !== fetchGenRef.current) return;
      setUnreadCount(typeof data.unreadCount === "number" ? data.unreadCount : 0);
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      /* best-effort poll */
    }
  }, []);

  useEffect(() => {
    setUnreadCount(initialUnreadCount);
  }, [initialUnreadCount]);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();

    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        if (document.visibilityState === "visible") void refresh();
      }, POLL_MS);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refresh();
        start();
      } else {
        stop();
      }
    };

    // Inbox form actions revalidate the layout badge; also resync dropdown items.
    const onFocus = () => {
      if (document.visibilityState === "visible") void refresh();
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
      mountedRef.current = false;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) void refresh();
  };

  const onItemSelect = (item: BellItem) => {
    const href = safeActionHref(item.actionUrl) ?? "/notificaciones";
    setOpen(false);
    void (async () => {
      if (item.status === "UNREAD") {
        const result = await markNotificationReadAction(item.id);
        if (result.ok && mountedRef.current) {
          setUnreadCount((c) => Math.max(0, c - 1));
          setItems((prev) =>
            prev.map((n) => (n.id === item.id ? { ...n, status: "READ" } : n)),
          );
        } else if (mountedRef.current) {
          // Resync badge if mark failed or already processed.
          void refresh();
        }
      }
      router.push(href);
    })();
  };

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
          title={
            unreadCount > 0
              ? `Notificaciones (${unreadCount} sin leer)`
              : "Notificaciones"
          }
          aria-label={
            unreadCount > 0
              ? `Notificaciones, ${unreadCount} sin leer`
              : "Notificaciones"
          }
        >
          <Bell className="h-4 w-4" aria-hidden />
          {unreadCount > 0 ? (
            <Badge
              variant="destructive"
              className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center px-1 text-[10px] font-semibold leading-none tabular-nums"
              aria-hidden
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[22rem] p-0 sm:w-96">
        <DropdownMenuLabel className="px-3 py-2.5 text-sm font-semibold">
          Notificaciones
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="m-0" />
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            No hay notificaciones recientes
          </p>
        ) : (
          <ul className="max-h-[22rem] overflow-y-auto py-1">
            {items.map((n) => {
              const unread = n.status === "UNREAD";
              return (
                <li key={n.id}>
                  <DropdownMenuItem
                    className={cn(
                      "cursor-pointer items-start gap-2 rounded-none px-3 py-2.5 focus:bg-accent",
                      unread && "bg-primary/5 dark:bg-primary/10",
                    )}
                    onSelect={(e) => {
                      e.preventDefault();
                      onItemSelect(n);
                    }}
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p
                        className={cn(
                          "truncate text-sm leading-snug",
                          unread ? "font-semibold text-foreground" : "font-medium text-muted-foreground",
                        )}
                      >
                        {n.title}
                      </p>
                      <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                      <p className="text-[11px] text-muted-foreground">{formatRelative(n.createdAt)}</p>
                    </div>
                    {unread ? (
                      <span
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary"
                        aria-hidden
                      />
                    ) : null}
                  </DropdownMenuItem>
                </li>
              );
            })}
          </ul>
        )}
        <DropdownMenuSeparator className="m-0" />
        <div className="p-1">
          <DropdownMenuItem asChild className="justify-center rounded-md text-sm font-medium">
            <Link href="/notificaciones">Ver todas</Link>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
