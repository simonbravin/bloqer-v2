"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { CollapsibleNavSection } from "@/features/shell/components/collapsible-nav-section";
import {
  buildProjectWorkspaceNavSections,
} from "@bloqer/services/project-workspace-nav";
import { tenantGateFromSnapshot } from "@/features/projects/tenant-gate-from-snapshot";
import { ProjectStatusBadge } from "@/features/projects/components/project-status-badge";
import type { PermissionModule, UserRole } from "@bloqer/domain";
import type { ProjectShellInfo } from "@bloqer/services";
import { ProjectNavIcon } from "@/lib/project-nav-icons";

function isNavItemActive(pathname: string, href: string, matchExact?: boolean) {
  return matchExact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

type ShellState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; shell: ProjectShellInfo };

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
          isNavItemActive(pathname, item.href, item.matchExact),
        );
        next[s.title] = hasActive ? true : (prev[s.title] ?? false);
      }
      return next;
    });
  }, [pathname, projectId, sections]);

  const [shellState, setShellState] = useState<ShellState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setShellState({ status: "loading" });
    void (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/shell`, { credentials: "same-origin" });
        const data = (await res.json()) as ProjectShellInfo | { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setShellState({
            status: "error",
            message: typeof data === "object" && data && "error" in data ? String(data.error) : "Error al cargar",
          });
          return;
        }
        setShellState({ status: "ok", shell: data as ProjectShellInfo });
      } catch {
        if (!cancelled) setShellState({ status: "error", message: "Error de red" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 shrink-0 items-center border-b border-sidebar-border/80 px-4">
        <Link
          href="/dashboard"
          className="inline-block rounded-md outline-none ring-offset-sidebar focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Image
            src="/bloqer-logo.png"
            alt="Bloqer"
            width={140}
            height={40}
            priority
            className="h-8 w-auto max-w-[9.5rem] object-contain object-left"
          />
        </Link>
      </div>

      <div className="mx-2 mb-3 mt-3 rounded-xl border border-border/80 bg-card px-3 py-3 text-card-foreground shadow-sm">
        <Link
          href="/proyectos"
          className="mb-2 inline-flex rounded-md text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          ← Volver a proyectos
        </Link>
        {shellState.status === "loading" && (
          <div className="space-y-2 animate-pulse">
            <div className="h-5 w-[85%] rounded bg-muted" />
            <div className="h-4 w-[45%] rounded bg-muted" />
            <div className="h-5 w-16 rounded bg-muted" />
          </div>
        )}
        {shellState.status === "error" && (
          <p className="text-xs text-destructive">{shellState.message}</p>
        )}
        {shellState.status === "ok" && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="min-w-0 flex-1 truncate text-base font-semibold leading-tight tracking-tight">
                {shellState.shell.name}
              </h2>
              <ProjectStatusBadge status={shellState.shell.status} />
            </div>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{shellState.shell.code}</p>
          </>
        )}
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-3 pr-1">
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
