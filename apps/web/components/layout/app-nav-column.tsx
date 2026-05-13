"use client";

import { usePathname } from "next/navigation";
import type { PermissionModule, UserRole } from "@bloqer/domain";
import { ProjectWorkspaceSidebar } from "./project-workspace-sidebar";
import { Sidebar } from "./sidebar";

interface AppNavColumnProps {
  tenantName?: string;
  roles: UserRole[];
  /** Serialized tenant module flags; omitted keys default to enabled (same as server gate). */
  moduleGateSnapshot?: Partial<Record<PermissionModule, boolean>>;
  /** When false, never swap to project workspace (e.g. user without tenant membership). */
  isTenantUser: boolean;
}

export function AppNavColumn({
  tenantName,
  roles,
  moduleGateSnapshot,
  isTenantUser,
}: AppNavColumnProps) {
  const pathname = usePathname();
  const m = pathname.match(/^\/proyectos\/([^/]+)/);
  const projectId = m?.[1];

  if (isTenantUser && projectId) {
    return (
      <ProjectWorkspaceSidebar
        projectId={projectId}
        tenantName={tenantName}
        roles={roles}
        moduleGateSnapshot={moduleGateSnapshot ?? {}}
      />
    );
  }

  return <Sidebar tenantName={tenantName} roles={roles} moduleGateSnapshot={moduleGateSnapshot} />;
}
