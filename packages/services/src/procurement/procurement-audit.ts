import type { Prisma } from "@bloqer/database";
import type { AuditScope } from "../audit/audit-scope";
import { log } from "../audit/audit.service";
import type { ServiceContext } from "../types";

export const PROCUREMENT_AUDIT_ACTIONS = [
  "purchase_order.created",
  "purchase_order.updated",
  "purchase_order.issued",
  "purchase_order.cancelled",
  "purchase_receipt.created",
  "purchase_receipt.confirmed",
  "purchase_receipt.cancelled",
] as const;

export type ProcurementAuditAction = (typeof PROCUREMENT_AUDIT_ACTIONS)[number];

export async function auditProcurement(
  ctx: ServiceContext,
  action: ProcurementAuditAction,
  entityType: "PurchaseOrder" | "PurchaseReceipt",
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
