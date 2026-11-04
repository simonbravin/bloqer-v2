import type { Prisma } from "@bloqer/database";
import type { ProjectTenantScope } from "./require-project-in-tenant";
import { ServiceError } from "../types";

/**
 * Recheck project state under the same row lock as lifecycle changes. Authorize
 * the operation before starting the transaction. NO KEY UPDATE still serializes
 * state writers while allowing FK KEY SHARE checks during ACL administration.
 * Acquire this lock before any
 * document/company locks and keep all dependent reads/writes on `tx`.
 */
export async function lockProjectForMutation(
  tx: Prisma.TransactionClient,
  projectId: string,
  tenantId: string,
): Promise<ProjectTenantScope> {
  await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId} AND "tenantId" = ${tenantId} FOR NO KEY UPDATE`;
  const project = await tx.project.findFirst({
    where: { id: projectId, tenantId },
    select: { id: true, tenantId: true, companyId: true, status: true, country: true },
  });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  return project;
}
