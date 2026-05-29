import type { Prisma } from "@bloqer/database";
import type { AuditScope } from "../audit/audit-scope";
import { log } from "../audit/audit.service";
import type { ServiceContext } from "../types";

export async function auditTreasury(
  ctx: ServiceContext,
  action: string,
  entityType: "TreasuryAccount" | "InternalTransfer" | "AccountMovement" | "Collection",
  entityId: string,
  scope: AuditScope,
  options?: {
    before?: Prisma.InputJsonValue;
    after?: Prisma.InputJsonValue;
    tx?: Prisma.TransactionClient;
  },
): Promise<void> {
  await log(
    {
      tenantId: ctx.tenantId,
      actorUserId: ctx.actorUserId,
      action,
      entityType,
      entityId,
      projectId: scope.projectId ?? null,
      companyId: scope.companyId ?? null,
      before: options?.before,
      after: options?.after,
      ipAddress: ctx.ipAddress ?? null,
    },
    options?.tx,
  );
}
