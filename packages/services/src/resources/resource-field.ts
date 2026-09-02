import { compareDecimal } from "@bloqer/utils";
import type { ResourceBoardRow } from "./project-resource-board.service";
import {
  RESOURCE_BOARD_ROUTE_SEGMENT,
  type ResourceBoardCategory,
} from "./resource-board-pure";
import { materialsFieldPrefillQuantity } from "../materials/materials-field";

export type ResourceFieldRow = {
  rowKey: string;
  wbsNodeId: string;
  wbsCode: string;
  wbsName: string;
  costAnalysisLineId: string | null;
  description: string;
  unit: string | null;
  needQty: string;
  orderedQty: string;
  invoicedQty: string;
  shortfallQty: string;
  requiredStart: string | null;
  requiredEnd: string | null;
  unscheduled: boolean;
  relatedPurchaseRequestId: string | null;
  relatedPurchaseRequestNumber: number | null;
  relatedPurchaseOrderId: string | null;
  relatedPurchaseOrderNumber: number | null;
  relatedSupplierInvoiceId: string | null;
  relatedSupplierInvoiceNumber: number | null;
};

export function toResourceFieldRow(row: ResourceBoardRow): ResourceFieldRow {
  return {
    rowKey: row.rowKey,
    wbsNodeId: row.wbsNodeId,
    wbsCode: row.wbsCode,
    wbsName: row.wbsName,
    costAnalysisLineId: row.costAnalysisLineId,
    description: row.description,
    unit: row.unit,
    needQty: row.needQty,
    orderedQty: row.orderedQty,
    invoicedQty: row.invoicedQty,
    shortfallQty: row.shortfallQty,
    requiredStart: row.requiredStart,
    requiredEnd: row.requiredEnd,
    unscheduled: row.unscheduled,
    relatedPurchaseRequestId: row.relatedPurchaseRequestId,
    relatedPurchaseRequestNumber: row.relatedPurchaseRequestNumber,
    relatedPurchaseOrderId: row.relatedPurchaseOrderId,
    relatedPurchaseOrderNumber: row.relatedPurchaseOrderNumber,
    relatedSupplierInvoiceId: row.relatedSupplierInvoiceId,
    relatedSupplierInvoiceNumber: row.relatedSupplierInvoiceNumber,
  };
}

function qtyGtZero(raw: string | null | undefined): boolean {
  if (raw == null || raw.trim() === "") return false;
  try {
    return compareDecimal(raw, "0") > 0;
  } catch {
    return false;
  }
}

export function isResourceFieldShortage(row: Pick<ResourceFieldRow, "shortfallQty">): boolean {
  return qtyGtZero(row.shortfallQty);
}

export type ResourcePedirPrefillRow = Pick<
  ResourceFieldRow,
  "wbsNodeId" | "description" | "shortfallQty" | "costAnalysisLineId" | "unit"
>;

export function resourcePedirQuery(
  row: ResourcePedirPrefillRow,
  costCategory: ResourceBoardCategory,
): URLSearchParams {
  const q = new URLSearchParams();
  q.set("wbsNodeId", row.wbsNodeId);
  q.set("description", row.description);
  q.set("quantity", materialsFieldPrefillQuantity(row.shortfallQty));
  if (row.costAnalysisLineId) q.set("costAnalysisLineId", row.costAnalysisLineId);
  if (row.unit) q.set("unit", row.unit);
  q.set("costType", costCategory);
  q.set("from", RESOURCE_BOARD_ROUTE_SEGMENT[costCategory]);
  return q;
}

export function resourceBoardPedirHref(
  projectId: string,
  row: ResourcePedirPrefillRow,
  costCategory: ResourceBoardCategory,
): string {
  return `/proyectos/${projectId}/solicitudes-compra?create=1&${resourcePedirQuery(row, costCategory).toString()}`;
}

export function resourceFieldPedirHref(
  projectId: string,
  row: ResourcePedirPrefillRow,
  costCategory: ResourceBoardCategory,
): string {
  return `/proyectos/${projectId}/solicitudes-compra/nueva?${resourcePedirQuery(row, costCategory).toString()}`;
}

export function resourceInvoiceHref(
  projectId: string,
  row: Pick<ResourceFieldRow, "wbsNodeId" | "description" | "costAnalysisLineId" | "unit" | "shortfallQty">,
  costCategory: ResourceBoardCategory,
): string {
  const q = new URLSearchParams();
  q.set("wbsNodeId", row.wbsNodeId);
  q.set("description", row.description);
  q.set("quantity", materialsFieldPrefillQuantity(row.shortfallQty));
  if (row.costAnalysisLineId) q.set("costAnalysisLineId", row.costAnalysisLineId);
  if (row.unit) q.set("unit", row.unit);
  q.set("costType", costCategory);
  q.set("from", RESOURCE_BOARD_ROUTE_SEGMENT[costCategory]);
  return `/proyectos/${projectId}/facturas-proveedor/nueva?${q.toString()}`;
}

export function resourcePedirCtaLabel(
  row: Pick<ResourceFieldRow, "relatedPurchaseRequestId" | "relatedPurchaseOrderId">,
): string {
  return row.relatedPurchaseRequestId || row.relatedPurchaseOrderId ? "Pedir resto" : "Pedir";
}

export function canShowResourcePedir(
  canRequest: boolean,
  row: Pick<ResourceFieldRow, "shortfallQty">,
): boolean {
  return canRequest && isResourceFieldShortage(row);
}

export function canShowResourceInvoice(
  canInvoice: boolean,
  row: Pick<ResourceFieldRow, "shortfallQty">,
): boolean {
  return canInvoice && isResourceFieldShortage(row);
}
