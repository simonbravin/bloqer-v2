/**
 * Complete schedule milestones when a purchase receipt is confirmed (D-104 / BR-SCH-005).
 */

import { Prisma } from "@bloqer/database";
import type { ScheduleItemStatus } from "@bloqer/database";
import type { ServiceContext } from "../types";
import { ServiceError } from "../types";
import {
  SCHEDULE_ITEM_ENTITY,
  auditSchedule,
  scheduleItemSnapshot,
} from "./schedule-audit";
import {
  assertScheduleStatusTransition,
  formatDateOnly,
  isScheduleLeafItem,
} from "./schedule-helpers";
import { serializeProgressPct } from "./schedule-progress-sync-pure";

/** Pure guard: PLANNED → COMPLETED only for MILESTONE. */
export function canCompleteScheduleItemDirectly(
  type: string,
  from: ScheduleItemStatus,
  to: ScheduleItemStatus,
): boolean {
  if (to !== "COMPLETED") return true;
  if (from === "IN_PROGRESS") return true;
  if (from === "PLANNED") return type === "MILESTONE";
  return false;
}

export function assertCanCompleteScheduleItem(
  type: string,
  from: ScheduleItemStatus,
  to: ScheduleItemStatus,
): void {
  assertScheduleStatusTransition(from, to);
  if (!canCompleteScheduleItemDirectly(type, from, to)) {
    throw new ServiceError(
      "VALIDATION",
      "Solo los hitos pueden pasar de Planificado a Completado sin pasar por En curso",
    );
  }
}

export type MilestoneWithWbs = {
  id: string;
  type: string;
  status: ScheduleItemStatus;
  wbsNodeIds: string[];
};

/** Pure: milestones linked to any of the receipt WBS that are still completable. */
export function selectMilestonesToCompleteFromReceipt(
  items: MilestoneWithWbs[],
  wbsNodeIds: string[],
): MilestoneWithWbs[] {
  if (wbsNodeIds.length === 0) return [];
  const wbs = new Set(wbsNodeIds);
  return items.filter(
    (item) =>
      item.type === "MILESTONE" &&
      (item.status === "PLANNED" || item.status === "IN_PROGRESS") &&
      item.wbsNodeIds.some((id) => wbs.has(id)),
  );
}

export type ProcurementDateByWbs = {
  expectedDeliveryDate: string | null;
  latestReceiptDate: string | null;
};

/**
 * Risk: for any shared WBS, promised OC delivery is after the earliest start of a
 * leaf TASK sibling that also links that same WBS ([D-104]).
 */
export function computeDeliveryAfterSiblingStart(
  item: {
    id: string;
    parentId: string | null;
    wbsNodeIds: string[];
  },
  allItems: Array<{
    id: string;
    parentId: string | null;
    type: string;
    status: string;
    startDate: string | null;
    wbsNodeIds: string[];
  }>,
  isLeaf: (id: string) => boolean,
  expectedByWbs: Map<string, string | null>,
): boolean {
  if (item.wbsNodeIds.length === 0) return false;

  for (const wbsId of item.wbsNodeIds) {
    const expected = expectedByWbs.get(wbsId) ?? null;
    if (!expected) continue;
    const siblingStarts = allItems
      .filter(
        (sib) =>
          sib.id !== item.id &&
          (sib.parentId ?? null) === (item.parentId ?? null) &&
          sib.type === "TASK" &&
          sib.status !== "CANCELLED" &&
          isLeaf(sib.id) &&
          sib.startDate != null &&
          sib.wbsNodeIds.includes(wbsId),
      )
      .map((sib) => sib.startDate!)
      .sort();
    if (siblingStarts.length > 0 && expected > siblingStarts[0]!) {
      return true;
    }
  }
  return false;
}

export function mergeProcurementDatesByWbs(
  wbsNodeIds: string[],
  byWbs: Map<string, ProcurementDateByWbs>,
): ProcurementDateByWbs {
  let expected: string | null = null;
  let latest: string | null = null;
  for (const id of wbsNodeIds) {
    const row = byWbs.get(id);
    if (!row) continue;
    if (row.expectedDeliveryDate) {
      if (!expected || row.expectedDeliveryDate < expected) {
        expected = row.expectedDeliveryDate;
      }
    }
    if (row.latestReceiptDate) {
      if (!latest || row.latestReceiptDate > latest) {
        latest = row.latestReceiptDate;
      }
    }
  }
  return { expectedDeliveryDate: expected, latestReceiptDate: latest };
}

export async function completeMilestonesFromPurchaseReceipt(args: {
  projectId: string | null;
  wbsNodeIds: string[];
  receiptId: string;
  receiptDate: Date;
  ctx: ServiceContext;
  tx: Prisma.TransactionClient;
}): Promise<string[]> {
  const { projectId, wbsNodeIds, receiptId, receiptDate, ctx, tx } = args;
  if (!projectId || wbsNodeIds.length === 0) return [];

  const uniqueWbs = [...new Set(wbsNodeIds.filter(Boolean))];
  if (uniqueWbs.length === 0) return [];

  const schedule = await tx.schedule.findFirst({
    where: { projectId, tenantId: ctx.tenantId },
    select: { id: true },
  });
  if (!schedule) return [];

  const milestones = await tx.scheduleItem.findMany({
    where: {
      scheduleId: schedule.id,
      tenantId: ctx.tenantId,
      type: "MILESTONE",
      status: { in: ["PLANNED", "IN_PROGRESS"] },
      wbsLinks: { some: { wbsNodeId: { in: uniqueWbs } } },
    },
  });

  const scheduleTree = await tx.scheduleItem.findMany({
    where: { scheduleId: schedule.id, tenantId: ctx.tenantId },
    select: { id: true, parentId: true, status: true },
  });

  const completedIds: string[] = [];
  for (const item of milestones) {
    // Same leaf rule as manual complete — never auto-complete container milestones.
    if (!isScheduleLeafItem(scheduleTree, item.id)) continue;
    assertCanCompleteScheduleItem(item.type, item.status, "COMPLETED");
    const before = scheduleItemSnapshot(item);
    const claimed = await tx.scheduleItem.updateMany({
      where: {
        id: item.id,
        tenantId: ctx.tenantId,
        status: item.status,
      },
      data: {
        status: "COMPLETED",
        progressPct: new Prisma.Decimal(100),
        updatedBy: ctx.actorUserId,
      },
    });
    if (claimed.count !== 1) continue;

    const updated = await tx.scheduleItem.findUniqueOrThrow({ where: { id: item.id } });
    await auditSchedule(
      ctx,
      "schedule_item.completed",
      SCHEDULE_ITEM_ENTITY,
      item.id,
      before,
      {
        ...scheduleItemSnapshot(updated),
        source: "purchase_receipt",
        receiptId,
        receiptDate: formatDateOnly(receiptDate),
        progressPct: serializeProgressPct(updated.progressPct.toString()),
      },
      tx,
    );
    completedIds.push(item.id);
  }

  return completedIds;
}
