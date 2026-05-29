import { prisma } from "@bloqer/database";
import type { Prisma } from "@bloqer/database";
import type { LogAuditInput } from "./audit-types";
import { ServiceError } from "../types";

type DbClient = Prisma.TransactionClient | typeof prisma;

export async function assertAuditContextScope(input: LogAuditInput, db: DbClient): Promise<void> {
  if (input.projectId) {
    const project = await db.project.findFirst({
      where: { id: input.projectId, tenantId: input.tenantId },
      select: { id: true },
    });
    if (!project) {
      throw new ServiceError("VALIDATION", "projectId no pertenece al tenant");
    }
  }

  if (input.companyId) {
    const company = await db.company.findFirst({
      where: { id: input.companyId, tenantId: input.tenantId },
      select: { id: true },
    });
    if (!company) {
      throw new ServiceError("VALIDATION", "companyId no pertenece al tenant");
    }
  }
}
