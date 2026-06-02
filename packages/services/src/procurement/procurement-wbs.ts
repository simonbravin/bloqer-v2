import { prisma } from "@bloqer/database";
import { ServiceError } from "../types";

export async function assertWbsLineForProject(
  wbsNodeId: string,
  projectId: string,
  tenantId: string,
): Promise<void> {
  const wbsNode = await prisma.wbsNode.findFirst({
    where: { id: wbsNodeId, budget: { tenantId } },
    include: { budget: { select: { projectId: true, status: true, tenantId: true } } },
  });
  if (!wbsNode) throw new ServiceError("NOT_FOUND", `Nodo WBS no encontrado: ${wbsNodeId}`);
  if (wbsNode.type !== "ITEM") throw new ServiceError("CONFLICT", "Solo se permiten nodos WBS de tipo ITEM");
  if (wbsNode.budget.projectId !== projectId) {
    throw new ServiceError("CONFLICT", "El nodo WBS no pertenece al proyecto");
  }
  if (!["APPROVED", "CLOSED"].includes(wbsNode.budget.status)) {
    throw new ServiceError("CONFLICT", "Solo se permiten nodos WBS de presupuestos APROBADOS o CERRADOS");
  }
}

export async function assertCompanyMatchesProject(
  companyId: string,
  projectId: string,
  tenantId: string,
): Promise<void> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId },
    select: { companyId: true },
  });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.companyId && project.companyId !== companyId) {
    throw new ServiceError("CONFLICT", "La empresa de la orden no coincide con la empresa del proyecto");
  }
}
