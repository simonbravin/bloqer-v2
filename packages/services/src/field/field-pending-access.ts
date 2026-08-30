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
 * Pending inbox sources ([D-087] + [D-094] + [D-097]).
 * Procurement follow-through (quote / confirm / receive / invoice) lives alongside approvals.
 */
export type FieldPendingSource =
  | "PURCHASE_REQUEST"
  | "PURCHASE_ORDER"
  | "PURCHASE_ORDER_CONFIRM"
  | "PURCHASE_ORDER_RECEIPT"
  | "PURCHASE_ORDER_INVOICE"
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
  PURCHASE_ORDER_INVOICE: "compras",
  JOBSITE_LOG: "obra",
  CERTIFICATION: "certificaciones",
  SUBCONTRACT_CERTIFICATION: "certificaciones",
};

/** Pipeline order for Compras portero (lower = earlier stage). */
export const FIELD_PENDING_COMPRAS_STAGE_ORDER: Record<
  Extract<
    FieldPendingSource,
    | "PURCHASE_REQUEST"
    | "PURCHASE_ORDER"
    | "PURCHASE_ORDER_CONFIRM"
    | "PURCHASE_ORDER_RECEIPT"
    | "PURCHASE_ORDER_INVOICE"
  >,
  number
> = {
  PURCHASE_REQUEST: 1,
  PURCHASE_ORDER: 2,
  PURCHASE_ORDER_CONFIRM: 3,
  PURCHASE_ORDER_RECEIPT: 4,
  PURCHASE_ORDER_INVOICE: 5,
};

export const FIELD_PENDING_COMPRAS_STAGE_LABEL: Record<
  keyof typeof FIELD_PENDING_COMPRAS_STAGE_ORDER,
  string
> = {
  PURCHASE_REQUEST: "Cotizar",
  PURCHASE_ORDER: "Aprobación",
  PURCHASE_ORDER_CONFIRM: "Confirmar",
  PURCHASE_ORDER_RECEIPT: "Recibir",
  PURCHASE_ORDER_INVOICE: "Facturar",
};

export function fieldPendingComprasStageOrder(source: FieldPendingSource): number {
  return FIELD_PENDING_COMPRAS_STAGE_ORDER[
    source as keyof typeof FIELD_PENDING_COMPRAS_STAGE_ORDER
  ] ?? 99;
}

export function fieldPendingComprasStageLabel(source: FieldPendingSource): string | null {
  return (
    FIELD_PENDING_COMPRAS_STAGE_LABEL[source as keyof typeof FIELD_PENDING_COMPRAS_STAGE_LABEL] ??
    null
  );
}

/** Which pending sources this actor may query. Module-off sources are omitted. */
export function fieldPendingSourcesForActor(
  roles: UserRole[],
  gate: Pick<TenantModuleGate, "isEnabled">,
): FieldPendingSource[] {
  const sources: FieldPendingSource[] = [];
  if (gate.isEnabled("PROCUREMENT")) {
    // PMs (EDIT PROCUREMENT) ven la SC pendiente en su bandeja pero, por diseño,
    // no reciben campana en cada submit (evita spam en obras con volumen alto).
    // La campana la manda `notifyPurchaseRequestSubmitted` a APPROVE PR/PO.
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
    // OC recibida sin factura del proveedor ([D-097] / [BR-PUR-020]).
    if (can(roles, "EDIT", "AP")) {
      sources.push("PURCHASE_ORDER_INVOICE");
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
