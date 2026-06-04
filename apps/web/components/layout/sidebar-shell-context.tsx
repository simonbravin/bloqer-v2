"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "bloqer:sidebar-open";
const STORE_CHANGE_EVENT = "bloqer:sidebar-store-change";
export const SHELL_SIDEBAR_WIDTH_CLASS = "w-64";
export const SHELL_SIDEBAR_ID = "app-shell-sidebar";
const SHELL_SIDEBAR_TOGGLE_ID = "shell-sidebar-toggle";

type SidebarShellContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  /** False on first paint — avoids animating width before persisted state is applied. */
  motionReady: boolean;
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

  const setOpen = useCallback((next: boolean) => {
    const prev = readStoredOpen();
    if (prev === next) return;
    persistOpen(next);
    if (!next) restoreFocusIfInsideSidebar();
    notifyStoreChange();
  }, []);

  const toggle = useCallback(() => {
    setOpen(!readStoredOpen());
  }, [setOpen]);

  const value = useMemo(
    () => ({
      open,
      setOpen,
      toggle,
      motionReady,
    }),
    [open, setOpen, toggle, motionReady],
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
        "flex h-full min-h-0 shrink-0 overflow-hidden border-sidebar-border",
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
  const { open, toggle } = useSidebarShell();
  return (
    <Button
      id={SHELL_SIDEBAR_TOGGLE_ID}
      type="button"
      variant="ghost"
      size="icon"
      className={cn("h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground", className)}
      onClick={toggle}
      aria-expanded={open}
      aria-controls={SHELL_SIDEBAR_ID}
      title={open ? "Ocultar menú lateral" : "Mostrar menú lateral"}
    >
      <PanelLeft className="h-4 w-4" aria-hidden />
      <span className="sr-only">{open ? "Ocultar menú lateral" : "Mostrar menú lateral"}</span>
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
