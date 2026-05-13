"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { NavItem } from "@/features/shell/components/nav-item";
import {
  buildProjectWorkspaceNavSections,
  type ProjectWorkspaceNavSection,
} from "@bloqer/services/project-workspace-nav";
import { tenantGateFromSnapshot } from "@/features/projects/tenant-gate-from-snapshot";
import { ProjectStatusBadge } from "@/features/projects/components/project-status-badge";
import type { PermissionModule, UserRole } from "@bloqer/domain";
import type { ProjectShellInfo } from "@bloqer/services";

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
  const gate = tenantGateFromSnapshot(moduleGateSnapshot);
  const sections: ProjectWorkspaceNavSection[] = buildProjectWorkspaceNavSections(projectId, gate, roles);

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

      <nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {section.title}
            </p>
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                <NavItem
                  key={`${item.label}-${item.href}`}
                  href={item.href}
                  label={item.label}
                  matchExact={item.matchExact}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
