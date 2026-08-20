"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useIsMdUp } from "@/lib/media-query";

const STORAGE_KEY = "bloqer:sidebar-open";
const STORE_CHANGE_EVENT = "bloqer:sidebar-store-change";
export const SHELL_SIDEBAR_WIDTH_CLASS = "w-64";
export const SHELL_SIDEBAR_ID = "app-shell-sidebar";
const SHELL_SIDEBAR_TOGGLE_ID = "shell-sidebar-toggle";

type SidebarShellContextValue = {
  /** Desktop rail: persisted. Mobile overlay uses `overlayOpen`. */
  open: boolean;
  overlayOpen: boolean;
  setOpen: (open: boolean) => void;
  setOverlayOpen: (open: boolean) => void;
  toggle: () => void;
  /** False on first paint — avoids animating width before persisted state is applied. */
  motionReady: boolean;
  isMdUp: boolean;
};

const SidebarShellContext = createContext<SidebarShellContextValue | null>(null);

function readStoredOpen(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "false") return false;
    if (stored === "true") return true;
  } catch {
    /* private mode */
  }
  return true;
}

function persistOpen(open: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(open));
  } catch {
    /* ignore */
  }
}

function notifyStoreChange() {
  window.dispatchEvent(new Event(STORE_CHANGE_EVENT));
}

function subscribe(onStoreChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) onStoreChange();
  };
  window.addEventListener(STORE_CHANGE_EVENT, onStoreChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(STORE_CHANGE_EVENT, onStoreChange);
    window.removeEventListener("storage", onStorage);
  };
}

function getServerSnapshot(): boolean {
  return true;
}

function focusShellSidebarToggle() {
  document.getElementById(SHELL_SIDEBAR_TOGGLE_ID)?.focus();
}

function restoreFocusIfInsideSidebar() {
  const sidebar = document.getElementById(SHELL_SIDEBAR_ID);
  if (sidebar?.contains(document.activeElement)) {
    focusShellSidebarToggle();
  }
}

export function SidebarShellProvider({
  children,
  motionReady = true,
}: {
  children: ReactNode;
  motionReady?: boolean;
}) {
  const open = useSyncExternalStore(subscribe, readStoredOpen, getServerSnapshot);
  const isMdUp = useIsMdUp();
  const pathname = usePathname();
  const [overlayOpen, setOverlayOpenState] = useState(false);

  const setOpen = useCallback((next: boolean) => {
    const prev = readStoredOpen();
    if (prev === next) return;
    persistOpen(next);
    if (!next) restoreFocusIfInsideSidebar();
    notifyStoreChange();
  }, []);

  const setOverlayOpen = useCallback((next: boolean) => {
    setOverlayOpenState((prev) => {
      if (prev === next) return prev;
      if (!next) restoreFocusIfInsideSidebar();
      return next;
    });
  }, []);

  const toggle = useCallback(() => {
    if (window.matchMedia("(min-width: 768px)").matches) {
      setOpen(!readStoredOpen());
      return;
    }
    setOverlayOpenState((prev) => !prev);
  }, [setOpen]);

  useEffect(() => {
    setOverlayOpenState(false);
  }, [pathname]);

  useEffect(() => {
    if (isMdUp) setOverlayOpenState(false);
  }, [isMdUp]);

  useEffect(() => {
    if (!overlayOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOverlayOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlayOpen, setOverlayOpen]);

  useEffect(() => {
    if (!overlayOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [overlayOpen]);

  const value = useMemo(
    () => ({
      open,
      overlayOpen,
      setOpen,
      setOverlayOpen,
      toggle,
      motionReady,
      isMdUp,
    }),
    [open, overlayOpen, setOpen, setOverlayOpen, toggle, motionReady, isMdUp],
  );

  return <SidebarShellContext.Provider value={value}>{children}</SidebarShellContext.Provider>;
}

export function useSidebarShell(): SidebarShellContextValue {
  const ctx = useContext(SidebarShellContext);
  if (!ctx) {
    throw new Error("useSidebarShell must be used within SidebarShellProvider");
  }
  return ctx;
}

export function SidebarRail({ children }: { children: ReactNode }) {
  const { open, motionReady } = useSidebarShell();
  return (
    <div
      className={cn(
        "hidden h-full min-h-0 shrink-0 overflow-hidden border-sidebar-border md:flex",
        motionReady && "transition-[width] duration-200 ease-in-out motion-reduce:transition-none",
        open ? cn(SHELL_SIDEBAR_WIDTH_CLASS, "border-r") : "pointer-events-none w-0 border-r-0",
      )}
      aria-hidden={!open}
    >
      {children}
    </div>
  );
}

export function ShellSidebarToggle({ className }: { className?: string }) {
  const { open, overlayOpen, toggle, isMdUp } = useSidebarShell();
  const expanded = isMdUp ? open : overlayOpen;
  return (
    <Button
      id={SHELL_SIDEBAR_TOGGLE_ID}
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        "h-11 w-11 min-h-11 min-w-11 shrink-0 text-muted-foreground hover:text-foreground md:h-9 md:w-9 md:min-h-9 md:min-w-9",
        className,
      )}
      onClick={toggle}
      aria-expanded={expanded}
      aria-controls={isMdUp ? SHELL_SIDEBAR_ID : `${SHELL_SIDEBAR_ID}-overlay`}
      title={expanded ? "Ocultar menú lateral" : "Mostrar menú lateral"}
    >
      <PanelLeft className="h-4 w-4" aria-hidden />
      <span className="sr-only">{expanded ? "Ocultar menú lateral" : "Mostrar menú lateral"}</span>
    </Button>
  );
}

export function ShellHeaderLeading({ children }: { children?: ReactNode }) {
  const hasTitle = Boolean(children);
  return (
    <div className="flex min-w-0 items-center gap-2 sm:gap-3">
      <ShellSidebarToggle />
      {hasTitle ? (
        <>
          <Separator orientation="vertical" className="hidden h-6 sm:block" />
          <div className="min-w-0">{children}</div>
        </>
      ) : null}
    </div>
  );
}
