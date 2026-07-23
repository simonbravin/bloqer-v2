"use client";

import Link from "next/link";
import { BloqerLogo } from "@/components/brand/bloqer-logo";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { CollapsibleNavSection } from "@/features/shell/components/collapsible-nav-section";
import {
  buildProjectWorkspaceNavSections,
} from "@bloqer/services/project-workspace-nav";
import { tenantGateFromSnapshot } from "@/features/projects/tenant-gate-from-snapshot";
import { ProjectStatusBadge } from "@/features/projects/components/project-status-badge";
import type { PermissionModule, UserRole } from "@bloqer/domain";
import { useProjectShell } from "@/lib/project-shell-context";
import { ProjectNavIcon } from "@/lib/project-nav-icons";
import { isNavLinkActive } from "@/lib/nav-link-active";

interface ProjectWorkspaceSidebarProps {
  projectId: string;
  roles: UserRole[];
  moduleGateSnapshot: Partial<Record<PermissionModule, boolean>>;
}

export function ProjectWorkspaceSidebar({
  projectId,
  roles,
  moduleGateSnapshot,
}: ProjectWorkspaceSidebarProps) {
  const pathname = usePathname();
  const { state: shellState } = useProjectShell();
  const gate = useMemo(() => tenantGateFromSnapshot(moduleGateSnapshot), [moduleGateSnapshot]);
  const sections = useMemo(
    () => buildProjectWorkspaceNavSections(projectId, gate, roles),
    [projectId, gate, roles],
  );

  const [openByTitle, setOpenByTitle] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setOpenByTitle((prev) => {
      const next: Record<string, boolean> = {};
      for (const s of sections) {
        const hasActive = s.items.some((item) =>
          isNavLinkActive(pathname, null, item.href, {
            matchExact: item.matchExact,
            activeWhenPathPrefix: item.activeWhenPathPrefix,
          }),
        );
        // Keep active section open; default-open Operación/Compras for process discoverability.
        const defaultOpen =
          s.title === "Resumen" || s.title === "Operación" || s.title === "Compras";
        next[s.title] = hasActive ? true : (prev[s.title] ?? defaultOpen);
      }
      return next;
    });
  }, [pathname, projectId, sections]);

  const shellForProject =
    shellState.status !== "idle" && shellState.projectId === projectId ? shellState : null;

  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 shrink-0 items-center border-b border-sidebar-border/80 px-4">
        <Link
          href="/dashboard"
          className="inline-block rounded-md outline-none ring-offset-sidebar focus-visible:ring-2 focus-visible:ring-ring"
        >
          <BloqerLogo priority className="h-8 max-w-[9.5rem]" />
        </Link>
      </div>

      <div className="mx-2 mb-3 mt-3 rounded-xl border border-border/80 bg-card px-3 py-3 text-card-foreground shadow-sm">
        {(!shellForProject || shellForProject.status === "loading") && (
          <div className="space-y-2 animate-pulse">
            <div className="h-5 w-[85%] rounded bg-muted" />
            <div className="h-4 w-[45%] rounded bg-muted" />
            <div className="h-5 w-16 rounded bg-muted" />
          </div>
        )}
        {shellForProject?.status === "error" && (
          <p className="text-xs text-destructive">{shellForProject.message}</p>
        )}
        {shellForProject?.status === "ok" && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="min-w-0 flex-1 truncate text-base font-semibold leading-tight tracking-tight">
                {shellForProject.shell.name}
              </h2>
              <ProjectStatusBadge status={shellForProject.shell.status} />
            </div>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{shellForProject.shell.code}</p>
          </>
        )}
      </div>

      <nav
        aria-label="Navegación del proyecto"
        className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-y-contain px-2 pb-3 pr-1"
      >
        {sections.map((section, sectionIndex) => {
          const open = openByTitle[section.title] ?? false;
          return (
            <CollapsibleNavSection
              key={section.title}
              title={section.title}
              sectionIndex={sectionIndex}
              open={open}
              onToggle={() =>
                setOpenByTitle((prev) => ({
                  ...prev,
                  [section.title]: !(prev[section.title] ?? false),
                }))
              }
              items={section.items.map((item) => ({
                ...item,
                icon: <ProjectNavIcon label={item.label} />,
              }))}
            />
          );
        })}
      </nav>
    </aside>
  );
}
