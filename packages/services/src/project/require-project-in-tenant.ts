/**
 * Tenant-scoped Project load for page/service guards.
 * Uses a narrow Prisma `select` so new Project columns (e.g. D-088 flags) are not
 * required for existence/tenant checks — avoids P2022 500s when deploy races migrate.
 */

import { prisma } from "@bloqer/database";
import type { ProjectStatus } from "@bloqer/database";
import { ServiceError } from "../types";

export type ProjectTenantScope = {
  id: string;
  tenantId: string;
  status: ProjectStatus;
  companyId: string | null;
  country: string;
};

const PROJECT_TENANT_SCOPE_SELECT = {
  id: true,
  tenantId: true,
  status: true,
  companyId: true,
  country: true,
} as const;

export async function requireProjectInTenant(
  projectId: string,
  tenantId: string,
): Promise<ProjectTenantScope> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: PROJECT_TENANT_SCOPE_SELECT,
  });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== tenantId) {
    throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  }
  return project;
}
