"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { NavItem } from "@/features/shell/components/nav-item";
import {
  buildProjectWorkspaceNavSections,
} from "@bloqer/services/project-workspace-nav";
import { tenantGateFromSnapshot } from "@/features/projects/tenant-gate-from-snapshot";
import { ProjectStatusBadge } from "@/features/projects/components/project-status-badge";
import { cn } from "@/lib/utils";
import type { PermissionModule, UserRole } from "@bloqer/domain";
import type { ProjectShellInfo } from "@bloqer/services";

function isNavItemActive(pathname: string, href: string, matchExact?: boolean) {
  return matchExact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

type ShellState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; shell: ProjectShellInfo };

interface ProjectWorkspaceSidebarProps {
  projectId: string;
  tenantName?: string;
  roles: UserRole[];
  moduleGateSnapshot: Partial<Record<PermissionModule, boolean>>;
}

export function ProjectWorkspaceSidebar({
  projectId,
  tenantName,
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
    <aside className="flex h-full w-64 shrink-0 flex-col border-r bg-background px-3 py-4">
      <div className="mb-4 px-3">
        <Link href="/dashboard" className="inline-block outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring">
          <Image
            src="/bloqer-logo.png"
            alt="Bloqer"
            width={140}
            height={40}
            priority
            className="h-8 w-auto max-w-[9.5rem] object-contain object-left"
          />
        </Link>
        {tenantName && <p className="mt-0.5 truncate text-xs text-muted-foreground">{tenantName}</p>}
      </div>

      <div className="mb-4 rounded-xl border bg-card px-3 py-3 shadow-sm">
        <Link
          href="/proyectos"
          className="mb-2 inline-flex text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
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

      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1">
        {sections.map((section, sectionIndex) => {
          const open = openByTitle[section.title] ?? false;
          const panelId = `project-nav-section-${sectionIndex}`;
          return (
            <div key={section.title} className="rounded-md">
              <button
                type="button"
                id={`${panelId}-trigger`}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() =>
                  setOpenByTitle((prev) => ({
                    ...prev,
                    [section.title]: !(prev[section.title] ?? false),
                  }))
                }
                className={cn(
                  "flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors",
                  "hover:bg-muted/70 hover:text-foreground",
                  open && "text-foreground",
                )}
              >
                <ChevronRight
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 text-muted-foreground/80 transition-transform duration-200",
                    open && "rotate-90",
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{section.title}</span>
              </button>
              {open ? (
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={`${panelId}-trigger`}
                  className="ml-1.5 mt-0.5 flex flex-col gap-0.5 border-l border-border/55 pl-3"
                >
                  {section.items.map((item) => (
                    <NavItem
                      key={`${item.label}-${item.href}`}
                      href={item.href}
                      label={item.label}
                      matchExact={item.matchExact}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
