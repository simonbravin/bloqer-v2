import type { Prisma } from "@bloqer/database";
import type { AuditScope } from "../audit/audit-scope";
import { log } from "../audit/audit.service";
import type { ServiceContext } from "../types";

export const PROCUREMENT_AUDIT_ACTIONS = [
  "purchase_order.created",
  "purchase_order.updated",
  "purchase_order.issued",
  "purchase_order.submitted",
  "purchase_order.approved",
  "purchase_order.confirmed",
  "purchase_order.returned_to_draft",
  "purchase_order.returned_for_changes",
  "purchase_order.cancelled",
  "purchase_request.created",
  "purchase_request.submitted",
  "purchase_request.cancelled",
  "procurement_quote.created",
  "procurement_quote.received",
  "procurement_quote.selected",
  "purchase_receipt.created",
  "purchase_receipt.confirmed",
  "purchase_receipt.cancelled",
] as const;

export type ProcurementAuditAction = (typeof PROCUREMENT_AUDIT_ACTIONS)[number];

export type ProcurementEntityType =
  | "PurchaseOrder"
  | "PurchaseReceipt"
  | "PurchaseRequest"
  | "ProcurementQuote";

export async function auditProcurement(
  ctx: ServiceContext,
  action: ProcurementAuditAction,
  entityType: ProcurementEntityType,
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
