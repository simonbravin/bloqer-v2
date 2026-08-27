import { can, type UserRole } from "@bloqer/domain";
import { isUuid } from "@bloqer/utils";
import {
  canApprovePurchaseOrders,
  canEditPurchaseOrders,
  canEditPurchaseReceipts,
  canManageProcurementQuotes,
} from "../procurement/procurement-access";
import { canEditSubcontractsArea } from "../subcontracts/subcontract-access";
import { canSuperviseJobsiteLog } from "../jobsite-log/jobsite-log-access";
import type { TenantModuleGate } from "../tenant-modules/tenant-module-gate";
import { ServiceError } from "../types";

/**
 * Pending inbox sources ([D-087] + [D-094]).
 * Procurement follow-through (quote / confirm / receive) lives alongside approvals.
 */
export type FieldPendingSource =
  | "PURCHASE_REQUEST"
  | "PURCHASE_ORDER"
  | "PURCHASE_ORDER_CONFIRM"
  | "PURCHASE_ORDER_RECEIPT"
  | "JOBSITE_LOG"
  | "CERTIFICATION"
  | "SUBCONTRACT_CERTIFICATION";

export type FieldPendingGroup = "compras" | "obra" | "certificaciones";

export const FIELD_PENDING_GROUPS: readonly FieldPendingGroup[] = [
  "compras",
  "obra",
  "certificaciones",
];

export function parseFieldPendingGroup(raw: string | null | undefined): FieldPendingGroup | undefined {
  return FIELD_PENDING_GROUPS.find((group) => group === raw);
}

/** Rejects non-UUID filters so a scoped inbox cannot silently widen to the whole tenant. */
export function resolveFieldPendingProjectFilter(projectId: string | undefined): string | undefined {
  if (!projectId) return undefined;
  if (!isUuid(projectId)) {
    throw new ServiceError("VALIDATION", "Proyecto inválido");
  }
  return projectId;
}

export const FIELD_PENDING_GROUP_BY_SOURCE: Record<FieldPendingSource, FieldPendingGroup> = {
  PURCHASE_REQUEST: "compras",
  PURCHASE_ORDER: "compras",
  PURCHASE_ORDER_CONFIRM: "compras",
  PURCHASE_ORDER_RECEIPT: "compras",
  JOBSITE_LOG: "obra",
  CERTIFICATION: "certificaciones",
  SUBCONTRACT_CERTIFICATION: "certificaciones",
};

/** Which pending sources this actor may query. Module-off sources are omitted. */
export function fieldPendingSourcesForActor(
  roles: UserRole[],
  gate: Pick<TenantModuleGate, "isEnabled">,
): FieldPendingSource[] {
  const sources: FieldPendingSource[] = [];
  if (gate.isEnabled("PROCUREMENT")) {
    if (canManageProcurementQuotes(roles)) {
      sources.push("PURCHASE_REQUEST");
    }
    if (canApprovePurchaseOrders(roles)) {
      sources.push("PURCHASE_ORDER");
    }
    if (canEditPurchaseOrders(roles)) {
      sources.push("PURCHASE_ORDER_CONFIRM");
    }
    if (canEditPurchaseReceipts(roles)) {
      sources.push("PURCHASE_ORDER_RECEIPT");
    }
  }
  if (gate.isEnabled("JOBSITE_LOG") && canSuperviseJobsiteLog(roles)) {
    sources.push("JOBSITE_LOG");
  }
  if (gate.isEnabled("CERTIFICATIONS") && can(roles, "APPROVE", "CERTIFICATIONS")) {
    sources.push("CERTIFICATION");
  }
  if (gate.isEnabled("SUBCONTRACTS") && canEditSubcontractsArea(roles)) {
    sources.push("SUBCONTRACT_CERTIFICATION");
  }
  return sources;
}

export function fieldPendingSourceAllowed(
  roles: UserRole[],
  gate: Pick<TenantModuleGate, "isEnabled">,
  source: FieldPendingSource,
): boolean {
  return fieldPendingSourcesForActor(roles, gate).includes(source);
}
