import type { Prisma } from "@bloqer/database";

export interface LogAuditInput {
  tenantId: string;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  projectId?: string | null;
  companyId?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  ipAddress?: string | null;
}
