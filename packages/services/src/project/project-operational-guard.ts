import type { ProjectStatus } from "@bloqer/database";
import type { ServiceContext } from "../types";
import { ServiceError } from "../types";
import { requireProjectAccess } from "../security/access";
import type { ProjectTenantScope } from "./require-project-in-tenant";

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

/**
 * Tenant + membership ACL + ACTIVE status for operational mutations.
 * Pass ServiceContext so MEMBERSHIP_SCOPED cannot mutate unauthorized obras via UUID.
 */
export async function assertProjectAllowsOperationalMutation(
  projectId: string,
  ctx: ServiceContext,
): Promise<ProjectTenantScope> {
  const project = await requireProjectAccess(projectId, ctx);

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
  ctx: ServiceContext,
): Promise<ProjectTenantScope> {
  const project = await requireProjectAccess(projectId, ctx);

  if (project.status === "ON_HOLD") {
    throw new ServiceError("CONFLICT", "La obra está pausada: no se pueden modificar presupuestos hasta reanudarla");
  }
  if (project.status === "COMPLETED" || project.status === "CANCELLED") {
    throw new ServiceError("CONFLICT", "La obra es de solo lectura operativa");
  }

  return project;
}
