"use client";

import { usePathname } from "next/navigation";
import type { PermissionModule, UserRole } from "@bloqer/domain";
import { isProjectIdSegment } from "@/lib/project-route";
import { ProjectWorkspaceSidebar } from "./project-workspace-sidebar";
import { Sidebar } from "./sidebar";

interface AppNavColumnProps {
  roles: UserRole[];
  /** Serialized tenant module flags; omitted keys default to enabled (same as server gate). */
  moduleGateSnapshot?: Partial<Record<PermissionModule, boolean>>;
  /** When false, never swap to project workspace (e.g. user without tenant membership). */
  isTenantUser: boolean;
}

export function AppNavColumn({ roles, moduleGateSnapshot, isTenantUser }: AppNavColumnProps) {
  const pathname = usePathname();
  const m = pathname.match(/^\/proyectos\/([^/]+)/);
  const projectId = m?.[1];

  if (isTenantUser && projectId && isProjectIdSegment(projectId)) {
    return (
      <ProjectWorkspaceSidebar
        projectId={projectId}
        roles={roles}
        moduleGateSnapshot={moduleGateSnapshot ?? {}}
      />
    );
  }

  return <Sidebar roles={roles} moduleGateSnapshot={moduleGateSnapshot} />;
}
