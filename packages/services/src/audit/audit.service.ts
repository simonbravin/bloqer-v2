import { prisma } from "@bloqer/database";
import type { AuditLog, Prisma } from "@bloqer/database";

export interface LogAuditInput {
  tenantId: string;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  ipAddress?: string | null;
}

export async function log(input: LogAuditInput): Promise<AuditLog> {
  return prisma.auditLog.create({ data: input });
}

export async function listEntityAuditLogs(
  tenantId: string,
  entityType: string,
  entityId: string,
  actions?: string[],
) {
  return prisma.auditLog.findMany({
    where: {
      tenantId,
      entityType,
      entityId,
      ...(actions?.length ? { action: { in: actions } } : {}),
    },
    include: {
      actor: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}
