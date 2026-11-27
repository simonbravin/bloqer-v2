import { addDecimal, compareDecimal, multiplyDecimal, roundQty } from "@bloqer/utils";
import { mergeProcurementDatesByWbs, type ProcurementDateByWbs } from "./schedule-milestone-from-receipt";

export type ScheduleProcurementLine = {
  id: string;
  purchaseOrderId: string;
  purchaseOrderCode: string;
  wbsNodeId: string;
  wbsCode: string;
  description: string;
  unit: string;
  quantity: string;
  receivedQuantity: string;
  remainingQuantity: string;
  expectedDeliveryDate: string | null;
};

export type ScheduleProcurementByWbs = ProcurementDateByWbs & {
  /** Null means the viewer cannot inspect OC details, never an empty pending list. */
  pendingLines: ScheduleProcurementLine[] | null;
  incompleteSources?: boolean;
};

export type ScheduleItemProcurement = ScheduleProcurementByWbs & {
  deliveryAfterSiblingStart: boolean;
};

/** Same remaining physical quantity as the canonical OC detail, at quantity precision. */
export function remainingScheduleProcurementQuantity(quantity: string, received: string): string {
  const remaining = addDecimal(quantity, multiplyDecimal(received, "-1"));
  return roundQty(compareDecimal(remaining, "0") > 0 ? remaining : "0");
}

/** Never aggregate quantities across different lines, units or linked tasks. */
export function mergeScheduleProcurement(
  wbsNodeIds: string[],
  byWbs: Map<string, ScheduleProcurementByWbs>,
): ScheduleItemProcurement | null {
  const ids = [...new Set(wbsNodeIds)];
  const dates = mergeProcurementDatesByWbs(ids, byWbs);
  const canReadLines = ids.some((id) => byWbs.get(id)?.pendingLines != null);
  const incompleteSources = ids.some((id) => byWbs.get(id)?.incompleteSources === true);
  const pendingLines = [...new Map(ids.flatMap((id) => byWbs.get(id)?.pendingLines ?? [])
    .map((line) => [line.id, line] as const)).values()];
  if (!dates.expectedDeliveryDate && !dates.latestReceiptDate && pendingLines.length === 0 && !incompleteSources) return null;
  return { ...dates, pendingLines: canReadLines ? pendingLines : null, incompleteSources, deliveryAfterSiblingStart: false };
}
