"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  SHELL_SIDEBAR_ID,
  SHELL_SIDEBAR_WIDTH_CLASS,
  SidebarRail,
  SidebarShellProvider,
  useSidebarShell,
} from "./sidebar-shell-context";

interface ShellLayoutProps {
  sidebar: ReactNode;
  header: ReactNode;
  children: ReactNode;
}

function ShellSidebarPanel({ children }: { children: ReactNode }) {
  const { open } = useSidebarShell();
  return (
    <div
      id={SHELL_SIDEBAR_ID}
      className={cn("h-full min-h-0", SHELL_SIDEBAR_WIDTH_CLASS)}
      {...(!open ? { inert: true as const } : {})}
    >
      {children}
    </div>
  );
}

export function ShellLayout({ sidebar, header, children }: ShellLayoutProps) {
  const [motionReady, setMotionReady] = useState(false);

  useEffect(() => {
    setMotionReady(true);
  }, []);

  return (
    <SidebarShellProvider motionReady={motionReady}>
      <div className="flex h-dvh overflow-hidden bg-background">
        <SidebarRail>
          <ShellSidebarPanel>{sidebar}</ShellSidebarPanel>
        </SidebarRail>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-workspace">
          {header}
          <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain p-4 sm:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </SidebarShellProvider>
  );
}
