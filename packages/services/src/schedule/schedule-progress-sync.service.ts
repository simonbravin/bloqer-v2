import { Prisma, prisma } from "@bloqer/database";
import { log } from "../audit/audit.service";
import { ServiceContext } from "../types";
import { SCHEDULE_ITEM_ENTITY, scheduleItemSnapshot } from "./schedule-audit";
import { assertScheduleStatusTransition, isScheduleLeafItem } from "./schedule-helpers";
import {
  capSyncProgressPct,
  resolveScheduleStatusAfterProgressSync,
} from "./schedule-progress-sync-pure";
import { shouldSyncProgressFromJobsite } from "./schedule-placement";

type TxClient = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

async function sumApprovedPhysicalPct(
  projectId: string,
  wbsNodeId: string,
  tenantId: string,
  excludeLogId: string,
  tx: TxClient,
): Promise<Prisma.Decimal> {
  const rows = await tx.jobsiteLogProgress.findMany({
    where: {
      wbsNodeId,
      physicalPct: { not: null },
      jobsiteLog: {
        tenantId,
        projectId,
        status: "APPROVED",
        id: { not: excludeLogId },
      },
    },
    select: { physicalPct: true },
  });
  let sum = new Prisma.Decimal(0);
  for (const r of rows) {
    if (r.physicalPct) sum = sum.add(r.physicalPct);
  }
  return sum;
}

async function resolveWbsPhysicalPct(
  projectId: string,
  wbsNodeId: string,
  jobsiteLogId: string,
  ctx: ServiceContext,
  tx: TxClient,
): Promise<Prisma.Decimal | null> {
  const approvedBase = await sumApprovedPhysicalPct(
    projectId,
    wbsNodeId,
    ctx.tenantId,
    jobsiteLogId,
    tx,
  );

  const logLines = await tx.jobsiteLogProgress.findMany({
    where: {
      jobsiteLogId,
      wbsNodeId,
    },
    select: { physicalPct: true, quantityCompleted: true },
  });

  let incremental = new Prisma.Decimal(0);
  let hasPhysical = false;
  for (const line of logLines) {
    if (line.physicalPct) {
      incremental = incremental.add(line.physicalPct);
      hasPhysical = true;
    }
  }

  if (hasPhysical) {
    return approvedBase.add(incremental);
  }

  // [D-045] Use schedule baseline budget qty — never latest DRAFT versionNumber.
  const schedule = await tx.schedule.findFirst({
    where: { projectId, tenantId: ctx.tenantId },
    select: { baselineBudgetId: true },
  });
  const costItem = await tx.costItem.findFirst({
    where: {
      wbsNodeId,
      ...(schedule?.baselineBudgetId
        ? { budgetId: schedule.baselineBudgetId }
        : {
            budget: {
              projectId,
              tenantId: ctx.tenantId,
              status: { in: ["APPROVED", "CLOSED"] },
            },
          }),
    },
    orderBy: { budget: { versionNumber: "desc" } },
    select: { quantity: true },
  });
  if (!costItem || costItem.quantity.lte(0)) return null;

  const approvedQtyRows = await tx.jobsiteLogProgress.findMany({
    where: {
      wbsNodeId,
      jobsiteLog: {
        tenantId: ctx.tenantId,
        projectId,
        status: "APPROVED",
        id: { not: jobsiteLogId },
      },
    },
    select: { quantityCompleted: true },
  });
  let qtySum = new Prisma.Decimal(0);
  for (const r of approvedQtyRows) qtySum = qtySum.add(r.quantityCompleted);
  for (const line of logLines) qtySum = qtySum.add(line.quantityCompleted);

  return qtySum.div(costItem.quantity).mul(100);
}

/**
 * BR-SCH-004 / D-045 — sync ScheduleItem.progressPct from an approved jobsite log.
 * Call inside the approve transaction before status flip.
 */
export async function syncScheduleProgressFromJobsiteLog(
  jobsiteLogId: string,
  projectId: string,
  ctx: ServiceContext,
  tx: TxClient,
): Promise<number> {
  const logProgress = await tx.jobsiteLogProgress.findMany({
    where: { jobsiteLogId },
    select: { wbsNodeId: true },
  });
  const wbsIds = [...new Set(logProgress.map((p) => p.wbsNodeId))];
  if (wbsIds.length === 0) return 0;

  const schedule = await tx.schedule.findUnique({
    where: { projectId },
    select: { id: true, tenantId: true },
  });
  if (!schedule || schedule.tenantId !== ctx.tenantId) return 0;

  const scheduleTree = await tx.scheduleItem.findMany({
    where: { scheduleId: schedule.id, tenantId: ctx.tenantId },
    select: { id: true, parentId: true, status: true },
  });

  let updated = 0;

  for (const wbsNodeId of wbsIds) {
    const pctDec = await resolveWbsPhysicalPct(projectId, wbsNodeId, jobsiteLogId, ctx, tx);
    if (!pctDec || pctDec.lessThanOrEqualTo(0)) continue;

    const pct = capSyncProgressPct(pctDec.toString());
    if (pct === null) continue;

    const links = await tx.scheduleItemWbsLink.findMany({
      where: {
        tenantId: ctx.tenantId,
        wbsNodeId,
        isPrimary: true,
        scheduleItem: {
          scheduleId: schedule.id,
          status: { not: "CANCELLED" },
        },
      },
      include: { scheduleItem: true },
    });

    for (const link of links) {
      const item = link.scheduleItem;
      if (!shouldSyncProgressFromJobsite(item.type)) continue;
      // Containers must not receive libro sync (same leaf rule as manual progress/status).
      if (!isScheduleLeafItem(scheduleTree, item.id)) continue;
      const before = scheduleItemSnapshot(item);
      const nextStatus = resolveScheduleStatusAfterProgressSync(item.status, pct);

      if (nextStatus !== item.status) {
        assertScheduleStatusTransition(item.status, nextStatus);
      }

      const row = await tx.scheduleItem.update({
        where: { id: item.id },
        data: {
          progressPct: pct,
          status: nextStatus,
          updatedBy: ctx.actorUserId,
        },
      });

      await log(
        {
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorUserId,
          action: "schedule_item.progress_updated",
          entityType: SCHEDULE_ITEM_ENTITY,
          entityId: item.id,
          projectId,
          before,
          after: scheduleItemSnapshot(row),
        },
        tx,
      );
      updated++;
    }
  }

  if (updated > 0) {
    await log(
      {
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId,
        projectId,
        action: "SCHEDULE_PROGRESS_SYNCED_FROM_JOBSITE_LOG",
        entityType: "JobsiteLog",
        entityId: jobsiteLogId,
        after: { scheduleItemsUpdated: updated },
      },
      tx,
    );
  }

  return updated;
}
