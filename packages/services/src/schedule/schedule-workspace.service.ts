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
import { computeDaysLate, formatDateOnly, computeTimePlanProgressPct, isScheduleLeafItem, mergeDerivedContainerDatesIntoDtos } from "./schedule-helpers";
import { ensureScheduleForProject } from "./schedule.service";
import { addDecimal, divideDecimal, multiplyDecimal, serializeMoney, sortTreeOrder } from "@bloqer/utils";
import { serializeProgressPct } from "./schedule-progress-sync-pure";

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
  /** True when cost-control budget ≠ persisted schedule baseline (no silent rewrite). */
  baselineBudgetMismatch: boolean;
  budgetId: string;
  budgetName: string;
  budgetStatus: string;
  /** ISO currency of the budget used for schedule item cost metrics (baseline when linked). */
  budgetCurrency: string;
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
  return serializeMoney(addDecimal(a, b));
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
    m.operationalProgressPct = serializeProgressPct(
      divideDecimal(
        multiplyDecimal(totalOpQty.toString(), "100"),
        totalBudgetQty.toString(),
        2,
      ),
    );
  }

  const sale = m.budgetTotalSale;
  if (sale !== "0.00" && !sale.startsWith("-")) {
    m.certifiedProgressPct = serializeProgressPct(
      divideDecimal(multiplyDecimal(m.certifiedApproved, "100"), sale, 2),
    );
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
      costItem: { select: { wbsNodeId: true, quantity: true } },
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
    // [D-059] partida money = totalCost × CostItem.quantity — round money at 2 dp (D-053)
    const partida = serializeMoney(
      multiplyDecimal(line.totalCost.toString(), line.costItem.quantity.toString()),
    );
    bucket[cat] = serializeMoney(addDecimal(bucket[cat], partida));
  }
  return map;
}

function mergeCategoryTotals(
  target: ScheduleCostByCategory,
  source: ScheduleCostByCategory,
): void {
  for (const k of Object.keys(target) as (keyof ScheduleCostByCategory)[]) {
    target[k] = serializeMoney(addDecimal(target[k], source[k]));
  }
}

export type ScheduleWorkspaceQueryTimings = {
  moduleGateMs: number;
  costControlMs: number;
  ensureScheduleMs: number;
  baselineWriteMs: number;
  secondCostControlMs: number;
  budgetCurrencyMs: number;
  itemCountMs: number;
  itemsMs: number;
  rollupSourceMs: number;
  costByCategoryMs: number;
  mapMs: number;
  totalMs: number;
};

let lastScheduleWorkspaceTimings: ScheduleWorkspaceQueryTimings | null = null;

export function getLastScheduleWorkspaceTimings(): ScheduleWorkspaceQueryTimings | null {
  return lastScheduleWorkspaceTimings;
}

export async function getProjectScheduleWorkspace(
  projectId: string,
  filters: ScheduleWorkspaceFilters,
  ctx: ServiceContext,
): Promise<ScheduleWorkspaceResult> {
  const t0 = Date.now();
  const mark = (from: number) => Date.now() - from;
  if (!canViewScheduleArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver cronograma");
  }

  let t = Date.now();
  const gate = await getTenantModuleGate(ctx);
  assertTenantModuleEnabledWithGate(gate, "PROJECTS");
  assertTenantModuleEnabledWithGate(gate, "SCHEDULE");
  const moduleGateMs = mark(t);

  t = Date.now();
  const cc = await getProjectCostControl(projectId, { budgetId: filters.budgetId }, ctx);
  const costControlMs = mark(t);
  if (cc.type === "BUDGET_SELECTION_REQUIRED") {
    return { type: "BUDGET_SELECTION_REQUIRED", availableBudgets: cc.availableBudgets };
  }
  if (cc.type === "NO_APPROVED_BUDGETS") {
    return { type: "NO_APPROVED_BUDGETS" };
  }

  t = Date.now();
  const schedule = await ensureScheduleForProject(projectId, ctx);
  const ensureScheduleMs = mark(t);

  // Only seed baseline when empty — never silently rewrite (orphans WBS links).
  let baselineBudgetId = schedule.baselineBudgetId;
  t = Date.now();
  if (!baselineBudgetId) {
    await prisma.schedule.update({
      where: { id: schedule.id },
      data: { baselineBudgetId: cc.budgetId, updatedBy: ctx.actorUserId },
    });
    baselineBudgetId = cc.budgetId;
  }
  const baselineWriteMs = mark(t);
  const baselineBudgetMismatch = baselineBudgetId !== cc.budgetId;

  /** WBS links live on the baseline budget — join cost rows there so committed/cert don't show fake zeros. */
  let metricsCc = cc;
  t = Date.now();
  if (baselineBudgetMismatch && baselineBudgetId) {
    const baselineCc = await getProjectCostControl(
      projectId,
      { budgetId: baselineBudgetId },
      ctx,
    );
    if (baselineCc.type === "REPORT") {
      metricsCc = baselineCc;
    }
  }
  const secondCostControlMs = mark(t);
  const costRowByWbs = new Map(metricsCc.rows.map((r) => [r.wbsNodeId, r]));

  t = Date.now();
  const metricsBudget = await prisma.budget.findUnique({
    where: { id: metricsCc.budgetId },
    select: { currency: true },
  });
  const budgetCurrencyMs = mark(t);
  const budgetCurrency = metricsBudget?.currency ?? "ARS";

  t = Date.now();
  const unfilteredActiveCount = await prisma.scheduleItem.count({
    where: {
      scheduleId: schedule.id,
      status: { not: "CANCELLED" },
    },
  });
  const itemCountMs = mark(t);

  t = Date.now();
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
  const itemsMs = mark(t);

  /** Rollup / leaf detection must use the full schedule tree — filters must not shrink it. */
  t = Date.now();
  const rollupSourceItems = await prisma.scheduleItem.findMany({
    where: { scheduleId: schedule.id },
    select: {
      id: true,
      parentId: true,
      status: true,
      startDate: true,
      endDate: true,
      progressPct: true,
      durationDays: true,
    },
  });
  const rollupSourceMs = mark(t);

  const allWbsIds = [
    ...new Set(items.flatMap((i) => i.wbsLinks.map((l) => l.wbsNodeId))),
  ];
  t = Date.now();
  const categoryByWbs = await loadCostByCategoryForWbs(allWbsIds);
  const costByCategoryMs = mark(t);
  const mapStarted = Date.now();

  const dtoItems: ScheduleWorkspaceItemDto[] = [];

  for (const item of items) {
    const isLeaf = isScheduleLeafItem(rollupSourceItems, item.id);
    const daysLate = isLeaf ? computeDaysLate(item.endDate, item.status) : null;
    if (filters.delayedOnly && daysLate === null) continue;

    const wbsLinks: ScheduleWbsLinkDto[] = item.wbsLinks.map((l) => ({
      wbsNodeId: l.wbsNodeId,
      wbsCode: l.wbsNode.code,
      wbsName: l.wbsNode.name,
      isPrimary: l.isPrimary,
    }));

    let metrics: ScheduleItemMetricsDto | null = null;
    if (wbsLinks.length > 0) {
      const linkedRows = wbsLinks
        .map((l) => costRowByWbs.get(l.wbsNodeId))
        .filter((r): r is CostControlRow => r !== undefined);

      if (linkedRows.length > 0) {
        metrics = aggregateMetricsFromRows(linkedRows);

        const catTotals: ScheduleCostByCategory = { ...EMPTY_CATEGORY };
        for (const link of wbsLinks) {
          const cats = categoryByWbs.get(link.wbsNodeId);
          if (cats) mergeCategoryTotals(catTotals, cats);
        }
        metrics.costByCategory = catTotals;

        if (linkedRows.length === 1) {
          const r = linkedRows[0]!;
          const qtyDec = new Prisma.Decimal(r.budgetQty);
          const saleDec = new Prisma.Decimal(r.budgetTotalSale);
          metrics.operationalProgressPct = qtyDec.gt(0)
            ? serializeProgressPct(
                divideDecimal(
                  multiplyDecimal(r.operationalProgressQty, "100"),
                  r.budgetQty,
                  2,
                ),
              )
            : null;
          if (saleDec.gt(0)) {
            metrics.certifiedProgressPct = serializeProgressPct(
              divideDecimal(
                multiplyDecimal(r.certifiedApproved, "100"),
                r.budgetTotalSale,
                2,
              ),
            );
          }
        }
      }
      // linked but no cost rows (orphan WBS ids) → metrics stay null; never fabricate zeros
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
      progressPct: serializeProgressPct(item.progressPct.toString()),
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

  mergeDerivedContainerDatesIntoDtos(
    dtoItems,
    rollupSourceItems,
  );

  const activeItems = dtoItems.filter((i) => i.status !== "CANCELLED");
  // Leaf KPIs from full tree (D-046) — not the status-filtered list.
  const fullActive = rollupSourceItems.filter((i) => i.status !== "CANCELLED");
  const fullLeafIds = new Set(
    fullActive.filter((i) => isScheduleLeafItem(fullActive, i.id)).map((i) => i.id),
  );
  const completedItems = fullActive.filter((i) => i.status === "COMPLETED").length;
  let delayedItems = 0;
  for (const i of fullActive) {
    if (!fullLeafIds.has(i.id)) continue;
    if (computeDaysLate(i.endDate, i.status) !== null) delayedItems += 1;
  }

  let weighted = "0";
  let weightSum = "0";
  for (const i of fullActive) {
    if (!fullLeafIds.has(i.id)) continue;
    const dur =
      i.durationDays && i.durationDays > 0 ? String(i.durationDays) : "1";
    weighted = addDecimal(
      weighted,
      multiplyDecimal(i.progressPct.toString(), dur),
    );
    weightSum = addDecimal(weightSum, dur);
  }
  const scheduleProgressPct = new Prisma.Decimal(weightSum).greaterThan(0)
      ? serializeProgressPct(divideDecimal(weighted, weightSum, 2))
      : null;

  lastScheduleWorkspaceTimings = {
    moduleGateMs,
    costControlMs,
    ensureScheduleMs,
    baselineWriteMs,
    secondCostControlMs,
    budgetCurrencyMs,
    itemCountMs,
    itemsMs,
    rollupSourceMs,
    costByCategoryMs,
    mapMs: Date.now() - mapStarted,
    totalMs: Date.now() - t0,
  };
  if (process.env.BLOQER_SCHEDULE_PROFILE === "1") {
    console.info("[schedule-workspace] timings", lastScheduleWorkspaceTimings);
  }

  return {
    type: "WORKSPACE",
    projectId,
    scheduleId: schedule.id,
    baselineBudgetId,
    baselineBudgetMismatch,
    budgetId: cc.budgetId,
    budgetName: cc.budgetName,
    budgetStatus: cc.budgetStatus,
    budgetCurrency,
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
