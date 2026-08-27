"use client";

import { cloneElement, isValidElement, useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { BreadcrumbOverrideProvider } from "@/lib/breadcrumb-override-context";
import { ProjectShellProvider } from "@/lib/project-shell-context";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  SHELL_SIDEBAR_ID,
  SHELL_SIDEBAR_WIDTH_CLASS,
  SidebarRail,
  SidebarShellProvider,
  useSidebarShell,
} from "./sidebar-shell-context";
import { FieldProjectProvider } from "@/lib/field-project-context";
import { isFieldImmersivePath } from "@/lib/field-immersive-routes";
import { FieldBottomNav } from "@/features/field/components/field-bottom-nav";
import type { PermissionModule, UserRole } from "@bloqer/domain";
import { usePathname } from "next/navigation";
import { PendingInboxCountProvider } from "@/lib/pending-inbox-count-context";

interface ShellLayoutProps {
  sidebar: ReactNode;
  header: ReactNode;
  children: ReactNode;
  pendingCount?: number;
  roles?: UserRole[];
  moduleGateSnapshot?: Partial<Record<PermissionModule, boolean>>;
}

function ShellSidebarPanel({ children, forOverlay }: { children: ReactNode; forOverlay?: boolean }) {
  const { open, overlayOpen } = useSidebarShell();
  const visible = forOverlay ? overlayOpen : open;
  return (
    <div
      className={cn("h-full min-h-0", SHELL_SIDEBAR_WIDTH_CLASS)}
      id={forOverlay ? `${SHELL_SIDEBAR_ID}-overlay` : SHELL_SIDEBAR_ID}
      {...(!visible ? { inert: true as const } : {})}
    >
      {children}
    </div>
  );
}

function MobileNavSheet({ children }: { children: ReactNode }) {
  const { overlayOpen, setOverlayOpen } = useSidebarShell();
  if (!overlayOpen) return null;
  return (
    <Sheet open={overlayOpen} onOpenChange={setOverlayOpen}>
      <SheetContent
        side="left"
        className="flex h-full w-64 max-w-[min(16rem,85vw)] flex-col gap-0 p-0 [&>button]:right-2 [&>button]:top-2 [&>button]:flex [&>button]:h-11 [&>button]:w-11 [&>button]:items-center [&>button]:justify-center"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Menú de navegación</SheetTitle>
        </SheetHeader>
        <ShellSidebarPanel forOverlay>{children}</ShellSidebarPanel>
      </SheetContent>
    </Sheet>
  );
}

export function ShellLayout({
  sidebar,
  header,
  children,
  pendingCount = 0,
  roles = [],
  moduleGateSnapshot = {},
}: ShellLayoutProps) {
  const [motionReady, setMotionReady] = useState(false);
  const pathname = usePathname();
  const immersive = isFieldImmersivePath(pathname);

  useEffect(() => {
    setMotionReady(true);
  }, []);

  const overlaySidebar = isValidElement(sidebar) ? cloneElement(sidebar) : sidebar;

  return (
    <SidebarShellProvider motionReady={motionReady}>
      <BreadcrumbOverrideProvider>
        <ProjectShellProvider>
          <FieldProjectProvider>
            <PendingInboxCountProvider tenantInitial={pendingCount}>
              <div className="flex h-dvh overflow-hidden bg-background">
                <SidebarRail>
                  <ShellSidebarPanel>{sidebar}</ShellSidebarPanel>
                </SidebarRail>
                <MobileNavSheet>{overlaySidebar}</MobileNavSheet>
                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-workspace">
                  {header}
                  <main
                    className={cn(
                      "min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain p-4 sm:p-6 lg:p-8",
                      !immersive &&
                        "pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-6 lg:pb-8",
                    )}
                  >
                    {children}
                  </main>
                  <FieldBottomNav
                    roles={roles}
                    moduleGateSnapshot={moduleGateSnapshot}
                  />
                </div>
              </div>
            </PendingInboxCountProvider>
          </FieldProjectProvider>
        </ProjectShellProvider>
      </BreadcrumbOverrideProvider>
    </SidebarShellProvider>
  );
}
