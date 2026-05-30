import { prisma } from "@bloqer/database";
import type { Project, ProjectStatus } from "@bloqer/database";
import { ServiceError } from "../types";

const STATUS_MESSAGES: Record<ProjectStatus, string> = {
  DRAFT: "La obra está en borrador: no se permiten operaciones de compra, certificación ni movimientos financieros",
  ON_HOLD: "La obra está pausada: no se permiten nuevos movimientos hasta reanudarla",
  COMPLETED: "La obra está completada y es de solo lectura operativa",
  CANCELLED: "La obra está cancelada y es de solo lectura operativa",
  ACTIVE: "",
};

export function getProjectOperationalMutationBlockReason(status: ProjectStatus): string | null {
  const message = STATUS_MESSAGES[status];
  return message || null;
}

export async function assertProjectAllowsOperationalMutation(
  projectId: string,
  tenantId: string,
): Promise<Project> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  if (project.status !== "ACTIVE") {
    const message =
      getProjectOperationalMutationBlockReason(project.status) ||
      "La obra no admite esta operación en su estado actual";
    throw new ServiceError("CONFLICT", message);
  }

  return project;
}

/** Budget/WBS planning: allowed in DRAFT and ACTIVE; blocked in ON_HOLD, COMPLETED, CANCELLED. */
export async function assertProjectAllowsBudgetPlanning(
  projectId: string,
  tenantId: string,
): Promise<Project> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  if (project.status === "ON_HOLD") {
    throw new ServiceError("CONFLICT", "La obra está pausada: no se pueden modificar presupuestos hasta reanudarla");
  }
  if (project.status === "COMPLETED" || project.status === "CANCELLED") {
    throw new ServiceError("CONFLICT", "La obra es de solo lectura operativa");
  }

  return project;
}
