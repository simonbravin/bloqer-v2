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
