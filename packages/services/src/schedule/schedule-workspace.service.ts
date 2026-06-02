import { Prisma, prisma } from "@bloqer/database";
import type { ScheduleItemStatus } from "@bloqer/database";
import {
  getProjectCostControl,
  type CostControlRow,
  type AvailableBudget,
} from "../cost-control/cost-control.service";
import type { ServiceContext } from "../types";
import { ServiceError } from "../types";
import { assertTenantModuleEnabledWithGate, getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import { canEditScheduleArea, canViewScheduleArea } from "./schedule-access";
import { computeDaysLate, formatDateOnly, ZERO_DEC, computeTimePlanProgressPct } from "./schedule-helpers";
import { ensureScheduleForProject } from "./schedule.service";
import { sortTreeOrder } from "@bloqer/utils";

export type ScheduleWorkspaceFilters = {
  budgetId?: string;
  status?: ScheduleItemStatus;
  delayedOnly?: boolean;
};

export type ScheduleWbsLinkDto = {
  wbsNodeId: string;
  wbsCode: string;
  wbsName: string;
  isPrimary: boolean;
};

export type ScheduleCostByCategory = Record<
  "MATERIAL" | "LABOR" | "EQUIPMENT" | "SUBCONTRACT" | "OTHER",
  string
>;

export type ScheduleItemMetricsDto = {
  budgetTotalCost: string;
  budgetTotalSale: string;
  committedCost: string;
  accruedCost: string;
  paidCost: string;
  certifiedApproved: string;
  operationalProgressPct: string | null;
  /** Economic progress % (certified / budget sale) when WBS linked — BR-SCH-002 read-only */
  certifiedProgressPct: string | null;
  costVariance: string;
  overBudget: boolean;
  costByCategory: ScheduleCostByCategory;
};

export type ScheduleWorkspaceItemDto = {
  id: string;
  parentId: string | null;
  sortOrder: number;
  name: string;
  type: string;
  status: ScheduleItemStatus;
  blockReason: string | null;
  startDate: string | null;
  endDate: string | null;
  durationDays: number | null;
  progressPct: string;
  /** Calendar-elapsed plan % (on-read, D-045). */
  timePlanPct: string | null;
  daysLate: number | null;
  wbsLinks: ScheduleWbsLinkDto[];
  metrics: ScheduleItemMetricsDto | null;
  predecessorIds: string[];
  successorIds: string[];
  /** FS edges where this item is the successor */
  predecessorDependencies: Array<{ dependencyId: string; predecessorId: string }>;
};

export type ScheduleWorkspaceDto = {
  type: "WORKSPACE";
  projectId: string;
  scheduleId: string;
  baselineBudgetId: string | null;
  budgetId: string;
  budgetName: string;
  budgetStatus: string;
  availableBudgets: AvailableBudget[];
  canEdit: boolean;
  items: ScheduleWorkspaceItemDto[];
  summary: {
    totalItems: number;
    /** Active items (non-CANCELLED) before status/delayedOnly URL filters */
    unfilteredActiveCount: number;
    completedItems: number;
    delayedItems: number;
    scheduleProgressPct: string | null;
  };
};

export type ScheduleBudgetSelectionRequired = {
  type: "BUDGET_SELECTION_REQUIRED";
  availableBudgets: AvailableBudget[];
};

export type ScheduleNoApprovedBudgets = {
  type: "NO_APPROVED_BUDGETS";
};

export type ScheduleWorkspaceResult =
  | ScheduleWorkspaceDto
  | ScheduleBudgetSelectionRequired
  | ScheduleNoApprovedBudgets;

const EMPTY_CATEGORY: ScheduleCostByCategory = {
  MATERIAL: "0.00",
  LABOR: "0.00",
  EQUIPMENT: "0.00",
  SUBCONTRACT: "0.00",
  OTHER: "0.00",
};

function emptyMetrics(): ScheduleItemMetricsDto {
  return {
    budgetTotalCost: "0.00",
    budgetTotalSale: "0.00",
    committedCost: "0.00",
    accruedCost: "0.00",
    paidCost: "0.00",
    certifiedApproved: "0.00",
    operationalProgressPct: null,
    certifiedProgressPct: null,
    costVariance: "0.00",
    overBudget: false,
    costByCategory: { ...EMPTY_CATEGORY },
  };
}

function addDecStrings(a: string, b: string): string {
  return new Prisma.Decimal(a).add(new Prisma.Decimal(b)).toFixed(2);
}

function aggregateMetricsFromRows(rows: CostControlRow[]): ScheduleItemMetricsDto {
  if (rows.length === 0) return emptyMetrics();

  let m = emptyMetrics();
  let totalOpQty = new Prisma.Decimal(0);
  let totalBudgetQty = new Prisma.Decimal(0);

  for (const r of rows) {
    m.budgetTotalCost = addDecStrings(m.budgetTotalCost, r.budgetTotalCost);
    m.budgetTotalSale = addDecStrings(m.budgetTotalSale, r.budgetTotalSale);
    m.committedCost = addDecStrings(m.committedCost, r.committedCost);
    m.accruedCost = addDecStrings(m.accruedCost, r.accruedCost);
    m.paidCost = addDecStrings(m.paidCost, r.paidCost);
    m.certifiedApproved = addDecStrings(m.certifiedApproved, r.certifiedApproved);
    m.costVariance = addDecStrings(m.costVariance, r.costVariance);
    if (r.flags.overBudget) m.overBudget = true;

    totalOpQty = totalOpQty.add(new Prisma.Decimal(r.operationalProgressQty));
    totalBudgetQty = totalBudgetQty.add(new Prisma.Decimal(r.budgetQty));
  }

  if (totalBudgetQty.gt(0)) {
    m.operationalProgressPct = totalOpQty.div(totalBudgetQty).mul(100).toFixed(2);
  }

  const sale = new Prisma.Decimal(m.budgetTotalSale);
  if (sale.gt(0)) {
    m.certifiedProgressPct = new Prisma.Decimal(m.certifiedApproved)
      .div(sale)
      .mul(100)
      .toFixed(2);
  }
  return m;
}

async function loadCostByCategoryForWbs(
  wbsNodeIds: string[],
): Promise<Map<string, ScheduleCostByCategory>> {
  const map = new Map<string, ScheduleCostByCategory>();
  if (wbsNodeIds.length === 0) return map;

  const lines = await prisma.costAnalysisLine.findMany({
    where: { costItem: { wbsNodeId: { in: wbsNodeIds } } },
    select: {
      category: true,
      totalCost: true,
      costItem: { select: { wbsNodeId: true } },
    },
  });

  for (const wbsId of wbsNodeIds) {
    map.set(wbsId, { ...EMPTY_CATEGORY });
  }

  for (const line of lines) {
    const wbsId = line.costItem.wbsNodeId;
    const bucket = map.get(wbsId);
    if (!bucket) continue;
    const cat = line.category as keyof ScheduleCostByCategory;
    bucket[cat] = new Prisma.Decimal(bucket[cat])
      .add(line.totalCost)
      .toFixed(2);
  }
  return map;
}

function mergeCategoryTotals(
  target: ScheduleCostByCategory,
  source: ScheduleCostByCategory,
): void {
  for (const k of Object.keys(target) as (keyof ScheduleCostByCategory)[]) {
    target[k] = new Prisma.Decimal(target[k]).add(new Prisma.Decimal(source[k])).toFixed(2);
  }
}

export async function getProjectScheduleWorkspace(
  projectId: string,
  filters: ScheduleWorkspaceFilters,
  ctx: ServiceContext,
): Promise<ScheduleWorkspaceResult> {
  if (!canViewScheduleArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver cronograma");
  }

  const gate = await getTenantModuleGate(ctx);
  assertTenantModuleEnabledWithGate(gate, "PROJECTS");
  assertTenantModuleEnabledWithGate(gate, "SCHEDULE");

  const cc = await getProjectCostControl(projectId, { budgetId: filters.budgetId }, ctx);
  if (cc.type === "BUDGET_SELECTION_REQUIRED") {
    return { type: "BUDGET_SELECTION_REQUIRED", availableBudgets: cc.availableBudgets };
  }
  if (cc.type === "NO_APPROVED_BUDGETS") {
    return { type: "NO_APPROVED_BUDGETS" };
  }

  const schedule = await ensureScheduleForProject(projectId, ctx);

  if (schedule.baselineBudgetId !== cc.budgetId) {
    await prisma.schedule.update({
      where: { id: schedule.id },
      data: { baselineBudgetId: cc.budgetId, updatedBy: ctx.actorUserId },
    });
  }

  const costRowByWbs = new Map(cc.rows.map((r) => [r.wbsNodeId, r]));

  const unfilteredActiveCount = await prisma.scheduleItem.count({
    where: {
      scheduleId: schedule.id,
      status: { not: "CANCELLED" },
    },
  });

  const items = await prisma.scheduleItem.findMany({
    where: {
      scheduleId: schedule.id,
      ...(filters.status ? { status: filters.status } : {}),
    },
    orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: {
      wbsLinks: { include: { wbsNode: { select: { id: true, code: true, name: true } } } },
      predecessors: { select: { id: true, predecessorId: true } },
      successors: { select: { successorId: true } },
    },
  });

  const allWbsIds = [
    ...new Set(items.flatMap((i) => i.wbsLinks.map((l) => l.wbsNodeId))),
  ];
  const categoryByWbs = await loadCostByCategoryForWbs(allWbsIds);

  const dtoItems: ScheduleWorkspaceItemDto[] = [];

  for (const item of items) {
    const daysLate = computeDaysLate(item.endDate, item.status);
    if (filters.delayedOnly && daysLate === null) continue;

    const wbsLinks: ScheduleWbsLinkDto[] = item.wbsLinks.map((l) => ({
      wbsNodeId: l.wbsNodeId,
      wbsCode: l.wbsNode.code,
      wbsName: l.wbsNode.name,
      isPrimary: l.isPrimary,
    }));

    let metrics: ScheduleItemMetricsDto | null = null;
    if (wbsLinks.length > 0) {
      const primary =
        wbsLinks.find((l) => l.isPrimary) ?? wbsLinks[0]!;
      const linkedRows = wbsLinks
        .map((l) => costRowByWbs.get(l.wbsNodeId))
        .filter((r): r is CostControlRow => r !== undefined);

      metrics = linkedRows.length > 0
        ? aggregateMetricsFromRows(linkedRows)
        : emptyMetrics();

      const catTotals: ScheduleCostByCategory = { ...EMPTY_CATEGORY };
      for (const link of wbsLinks) {
        const cats = categoryByWbs.get(link.wbsNodeId);
        if (cats) mergeCategoryTotals(catTotals, cats);
      }
      metrics.costByCategory = catTotals;

      if (linkedRows.length === 1) {
        const r = linkedRows[0]!;
        const qty = new Prisma.Decimal(r.budgetQty);
        const op = new Prisma.Decimal(r.operationalProgressQty);
        metrics.operationalProgressPct = qty.gt(0)
          ? op.div(qty).mul(100).toFixed(2)
          : null;
        const sale = new Prisma.Decimal(r.budgetTotalSale);
        if (sale.gt(0)) {
          metrics.certifiedProgressPct = new Prisma.Decimal(r.certifiedApproved)
            .div(sale)
            .mul(100)
            .toFixed(2);
        }
      }
    }

    dtoItems.push({
      id: item.id,
      parentId: item.parentId,
      sortOrder: item.sortOrder,
      name: item.name,
      type: item.type,
      status: item.status,
      blockReason: item.blockReason,
      startDate: formatDateOnly(item.startDate),
      endDate: formatDateOnly(item.endDate),
      durationDays: item.durationDays,
      progressPct: item.progressPct.toFixed(2),
      timePlanPct: computeTimePlanProgressPct(
        formatDateOnly(item.startDate),
        formatDateOnly(item.endDate),
      ),
      daysLate,
      wbsLinks,
      metrics,
      predecessorIds: item.predecessors.map((p) => p.predecessorId),
      successorIds: item.successors.map((s) => s.successorId),
      predecessorDependencies: item.predecessors.map((p) => ({
        dependencyId: p.id,
        predecessorId: p.predecessorId,
      })),
    });
  }

  const activeItems = dtoItems.filter((i) => i.status !== "CANCELLED");
  const completedItems = activeItems.filter((i) => i.status === "COMPLETED").length;
  const delayedItems = activeItems.filter((i) => i.daysLate !== null).length;

  let weighted = ZERO_DEC;
  let weightSum = ZERO_DEC;
  for (const i of activeItems) {
    const dur = i.durationDays && i.durationDays > 0
      ? new Prisma.Decimal(i.durationDays)
      : new Prisma.Decimal(1);
    weighted = weighted.add(new Prisma.Decimal(i.progressPct).mul(dur));
    weightSum = weightSum.add(dur);
  }
  const scheduleProgressPct = weightSum.gt(0)
    ? weighted.div(weightSum).toFixed(2)
    : null;

  return {
    type: "WORKSPACE",
    projectId,
    scheduleId: schedule.id,
    baselineBudgetId: cc.budgetId,
    budgetId: cc.budgetId,
    budgetName: cc.budgetName,
    budgetStatus: cc.budgetStatus,
    availableBudgets: cc.availableBudgets,
    canEdit: canEditScheduleArea(ctx.roles),
    items: sortTreeOrder(dtoItems, (a, b) => a.name.localeCompare(b.name, "es")),
    summary: {
      totalItems: activeItems.length,
      unfilteredActiveCount,
      completedItems,
      delayedItems,
      scheduleProgressPct,
    },
  };
}

export async function computeProjectScheduleProgressPct(
  projectId: string,
  ctx: ServiceContext,
): Promise<string | null> {
  const ws = await getProjectScheduleWorkspace(projectId, {}, ctx);
  if (ws.type !== "WORKSPACE") return null;
  return ws.summary.scheduleProgressPct;
}
