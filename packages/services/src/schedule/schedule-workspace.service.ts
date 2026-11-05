import { Prisma, prisma } from "@bloqer/database";
import type { ScheduleItemStatus } from "@bloqer/database";
import {
  addDecimal,
  divideDecimal,
  multiplyDecimal,
  serializeMoney,
  sortTreeOrder,
} from "@bloqer/utils";
import { canViewBudgetsArea } from "../project/project-nav-guards";
import { requireProjectAccess, canViewProcurementCapability } from "../security/access";
import { companyScopeFilter } from "../company-scope";
import {
  getProjectCostControl,
  type CostControlRow,
  type AvailableBudget,
} from "../cost-control/cost-control.service";
import type { ServiceContext } from "../types";
import { ServiceError } from "../types";
import {
  assertTenantModuleEnabledWithGate,
  getTenantModuleGate,
} from "../tenant-modules/tenant-module.service";
import { canEditScheduleArea, canViewScheduleArea } from "./schedule-access";
import {
  computeDaysLate,
  formatDateOnly,
  computeTimePlanProgressPct,
  isScheduleLeafItem,
  mergeDerivedContainerDatesIntoDtos,
} from "./schedule-helpers";
import {
  ensureScheduleForProject,
  findScheduleForProject,
  ensureScheduleBaselineForProject,
} from "./schedule.service";
import { serializeProgressPct } from "./schedule-progress-sync-pure";
import {
  computeDeliveryAfterSiblingStart,
  mergeProcurementDatesByWbs,
  type ProcurementDateByWbs,
} from "./schedule-milestone-from-receipt";

export type ScheduleWorkspaceFilters = {
  budgetId?: string;
  status?: ScheduleItemStatus;
  delayedOnly?: boolean;
  /** D-103 — TASK | MILESTONE */
  itemType?: "TASK" | "MILESTONE";
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
  /** Leaf vs container from the **full** schedule tree (ignores URL filters). */
  isLeaf: boolean;
  /** Depth from root using the full tree parent chain. */
  treeDepth: number;
  wbsLinks: ScheduleWbsLinkDto[];
  metrics: ScheduleItemMetricsDto | null;
  predecessorIds: string[];
  successorIds: string[];
  /** FS edges where this item is the successor */
  predecessorDependencies: Array<{ dependencyId: string; predecessorId: string }>;
  /**
   * Purchase dates for linked WBS ([D-104]).
   * Null when there is nothing to show (no EDT, or no dates/risk).
   */
  procurement: {
    expectedDeliveryDate: string | null;
    latestReceiptDate: string | null;
    deliveryAfterSiblingStart: boolean;
  } | null;
};

/** Full active tree for placement / reorder UI (ignores URL filters). */
export type ScheduleTreeItemDto = {
  id: string;
  parentId: string | null;
  sortOrder: number;
  status: ScheduleItemStatus;
  name: string;
  type: string;
  isLeaf: boolean;
  wbsNodeIds: string[];
};

export type ScheduleWorkspaceDto = {
  type: "WORKSPACE";
  projectId: string;
  scheduleId: string;
  baselineBudgetId: string | null;
  /** True when cost-control budget ≠ persisted schedule baseline (no silent rewrite). */
  baselineBudgetMismatch: boolean;
  budgetId: string | null;
  budgetName: string | null;
  budgetStatus: string | null;
  /** ISO currency of the budget used for schedule item cost metrics (baseline when linked). */
  budgetCurrency: string | null;
  /** Expected optional financial-data failures do not block temporal planning. */
  metricsWarning?: string | null;
  availableBudgets: AvailableBudget[];
  canEdit: boolean;
  items: ScheduleWorkspaceItemDto[];
  /** Unfiltered active items for create/reorder placement (D-103). */
  treeItems: ScheduleTreeItemDto[];
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

  const m = emptyMetrics();
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
      divideDecimal(multiplyDecimal(totalOpQty.toString(), "100"), totalBudgetQty.toString(), 2),
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

function mergeCategoryTotals(target: ScheduleCostByCategory, source: ScheduleCostByCategory): void {
  for (const k of Object.keys(target) as (keyof ScheduleCostByCategory)[]) {
    target[k] = serializeMoney(addDecimal(target[k], source[k]));
  }
}

/** Batch PO expectedDelivery + confirmed receipt dates per WBS ([D-104]). */
async function loadProcurementDatesByWbs(
  projectId: string,
  ctx: ServiceContext,
  wbsNodeIds: string[],
): Promise<Map<string, ProcurementDateByWbs>> {
  const map = new Map<string, ProcurementDateByWbs>();
  for (const id of wbsNodeIds) {
    map.set(id, { expectedDeliveryDate: null, latestReceiptDate: null });
  }
  if (wbsNodeIds.length === 0) return map;

  const poLines = await prisma.purchaseOrderLine.findMany({
    where: {
      wbsNodeId: { in: wbsNodeIds },
      purchaseOrder: {
        tenantId: ctx.tenantId,
        projectId,
        ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
        status: { in: ["CONFIRMED", "PARTIALLY_RECEIVED"] },
        expectedDeliveryDate: { not: null },
      },
    },
    select: {
      wbsNodeId: true,
      purchaseOrder: { select: { expectedDeliveryDate: true } },
    },
  });

  for (const line of poLines) {
    if (!line.wbsNodeId || !line.purchaseOrder.expectedDeliveryDate) continue;
    const iso = formatDateOnly(line.purchaseOrder.expectedDeliveryDate);
    if (!iso) continue;
    const row = map.get(line.wbsNodeId);
    if (!row) continue;
    if (!row.expectedDeliveryDate || iso < row.expectedDeliveryDate) {
      row.expectedDeliveryDate = iso;
    }
  }

  const receiptLines = await prisma.purchaseReceiptLine.findMany({
    where: {
      purchaseOrderLine: { wbsNodeId: { in: wbsNodeIds } },
      purchaseReceipt: {
        tenantId: ctx.tenantId,
        projectId,
        ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
        status: "CONFIRMED",
      },
    },
    select: {
      purchaseOrderLine: { select: { wbsNodeId: true } },
      purchaseReceipt: { select: { receiptDate: true } },
    },
  });

  for (const line of receiptLines) {
    const wbsId = line.purchaseOrderLine.wbsNodeId;
    if (!wbsId) continue;
    const iso = formatDateOnly(line.purchaseReceipt.receiptDate);
    if (!iso) continue;
    const row = map.get(wbsId);
    if (!row) continue;
    if (!row.latestReceiptDate || iso > row.latestReceiptDate) {
      row.latestReceiptDate = iso;
    }
  }

  return map;
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

async function readOptionalCostControl(
  projectId: string,
  budgetId: string | undefined,
  ctx: ServiceContext,
) {
  try {
    return { report: await getProjectCostControl(projectId, { budgetId }, ctx), warning: null };
  } catch (error) {
    if (
      error instanceof ServiceError &&
      (error.code === "CONFLICT" || error.code === "VALIDATION")
    ) {
      return {
        report: null,
        warning: `Las métricas económicas no están disponibles: ${error.message}`,
      };
    }
    throw error;
  }
}

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
  const project = await requireProjectAccess(projectId, ctx);
  const canEdit =
    canEditScheduleArea(ctx.roles) && (project.status === "DRAFT" || project.status === "ACTIVE");
  const canReadBudgets = gate.isEnabled("BUDGETS") && canViewBudgetsArea(ctx.roles);
  const optionalCosts = canReadBudgets
    ? await readOptionalCostControl(projectId, filters.budgetId, ctx)
    : { report: null, warning: null };
  const result = optionalCosts.report;
  let metricsWarning = optionalCosts.warning;
  const cc = result?.type === "REPORT" ? result : null;
  const availableBudgets =
    result && result.type !== "NO_APPROVED_BUDGETS" ? [...result.availableBudgets] : [];
  const costControlMs = mark(t);
  if (result?.type === "BUDGET_SELECTION_REQUIRED") {
    return { type: "BUDGET_SELECTION_REQUIRED", availableBudgets };
  }

  t = Date.now();
  const existingSchedule = await findScheduleForProject(projectId, ctx);
  if (!existingSchedule && !canEdit) {
    lastScheduleWorkspaceTimings = {
      moduleGateMs,
      costControlMs,
      ensureScheduleMs: mark(t),
      baselineWriteMs: 0,
      secondCostControlMs: 0,
      budgetCurrencyMs: 0,
      itemCountMs: 0,
      itemsMs: 0,
      rollupSourceMs: 0,
      costByCategoryMs: 0,
      mapMs: 0,
      totalMs: Date.now() - t0,
    };
    return {
      type: "WORKSPACE",
      projectId,
      scheduleId: "",
      baselineBudgetId: null,
      baselineBudgetMismatch: false,
      budgetId: cc?.budgetId ?? null,
      budgetName: cc?.budgetName ?? null,
      budgetStatus: cc?.budgetStatus ?? null,
      budgetCurrency: cc?.currency ?? null,
      metricsWarning,
      availableBudgets,
      canEdit: false,
      items: [],
      treeItems: [],
      summary: {
        totalItems: 0,
        unfilteredActiveCount: 0,
        completedItems: 0,
        delayedItems: 0,
        scheduleProgressPct: null,
      },
    };
  }
  const schedule = existingSchedule ?? (await ensureScheduleForProject(projectId, ctx));
  const ensureScheduleMs = mark(t);

  // Only seed baseline when empty — never silently rewrite (orphans WBS links).
  // Requires EDIT: VIEW must not mutate baseline on read.
  let baselineBudgetId = canReadBudgets ? schedule.baselineBudgetId : null;
  t = Date.now();
  if (!baselineBudgetId && canEdit && cc) {
    const seeded = await ensureScheduleBaselineForProject(projectId, cc.budgetId, ctx);
    baselineBudgetId = seeded.baselineBudgetId;
  }
  const baselineWriteMs = mark(t);
  let baselineBudgetMismatch = false;

  /** WBS links live on the baseline budget — join cost rows there so committed/cert don't show fake zeros. */
  let metricsCc = cc;
  let budgetMetadata = cc
    ? { id: cc.budgetId, name: cc.budgetName, status: cc.budgetStatus, currency: cc.currency }
    : null;
  t = Date.now();
  if (canReadBudgets && baselineBudgetId) {
    const visibleBaseline = await prisma.budget.findFirst({
      where: {
        id: baselineBudgetId,
        tenantId: ctx.tenantId,
        projectId,
        ...companyScopeFilter(ctx),
        status: { in: ["APPROVED", "CLOSED"] },
      },
      select: {
        id: true,
        name: true,
        status: true,
        currency: true,
        versionNumber: true,
        parentBudgetId: true,
      },
    });
    if (!visibleBaseline) {
      baselineBudgetId = null;
      metricsCc = null;
      budgetMetadata = null;
      metricsWarning = "Las métricas económicas no están disponibles en este contexto.";
    } else {
      budgetMetadata = visibleBaseline;
      baselineBudgetMismatch = Boolean(cc && visibleBaseline.id !== cc.budgetId);
      if (metricsWarning && availableBudgets.length === 0)
        availableBudgets.push({
          id: visibleBaseline.id,
          name: visibleBaseline.name,
          status: visibleBaseline.status,
          versionNumber: visibleBaseline.versionNumber,
          parentBudgetId: visibleBaseline.parentBudgetId,
        });
      if (baselineBudgetMismatch) {
        const baselineCosts = await readOptionalCostControl(projectId, visibleBaseline.id, ctx);
        metricsCc = baselineCosts.report?.type === "REPORT" ? baselineCosts.report : null;
        metricsWarning = baselineCosts.warning;
      }
    }
  }
  const secondCostControlMs = mark(t);
  const costRowByWbs = new Map((metricsCc?.rows ?? []).map((r) => [r.wbsNodeId, r]));

  t = Date.now();
  const budgetCurrency = budgetMetadata?.currency ?? null;
  const budgetCurrencyMs = mark(t);

  t = Date.now();
  const unfilteredActiveCount = await prisma.scheduleItem.count({
    where: {
      scheduleId: schedule.id,
      tenantId: ctx.tenantId,
      status: { not: "CANCELLED" },
    },
  });
  const itemCountMs = mark(t);

  t = Date.now();
  const items = await prisma.scheduleItem.findMany({
    where: {
      scheduleId: schedule.id,
      tenantId: ctx.tenantId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.itemType ? { type: filters.itemType } : {}),
    },
    orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: {
      wbsLinks: {
        where: budgetMetadata
          ? {
              tenantId: ctx.tenantId,
              wbsNode: {
                budget: { tenantId: ctx.tenantId, projectId, ...companyScopeFilter(ctx) },
              },
            }
          : { id: { in: [] } },
        include: { wbsNode: { select: { id: true, code: true, name: true } } },
      },
      predecessors: {
        where: {
          tenantId: ctx.tenantId,
          predecessor: { scheduleId: schedule.id, tenantId: ctx.tenantId },
        },
        select: { id: true, predecessorId: true },
      },
      successors: {
        where: {
          tenantId: ctx.tenantId,
          successor: { scheduleId: schedule.id, tenantId: ctx.tenantId },
        },
        select: { successorId: true },
      },
    },
  });
  const itemsMs = mark(t);

  /** Rollup / leaf detection must use the full schedule tree — filters must not shrink it. */
  t = Date.now();
  const rollupSourceItems = await prisma.scheduleItem.findMany({
    where: { scheduleId: schedule.id, tenantId: ctx.tenantId },
    select: {
      id: true,
      parentId: true,
      status: true,
      type: true,
      name: true,
      sortOrder: true,
      startDate: true,
      endDate: true,
      progressPct: true,
      durationDays: true,
    },
  });
  const rollupSourceMs = mark(t);

  const parentById = new Map(rollupSourceItems.map((i) => [i.id, i.parentId]));
  const treeDepthOf = (id: string): number => {
    let depth = 0;
    let current = parentById.get(id) ?? null;
    const seen = new Set<string>();
    while (current) {
      if (seen.has(current)) break;
      seen.add(current);
      depth += 1;
      current = parentById.get(current) ?? null;
    }
    return depth;
  };

  t = Date.now();
  const categoryByWbs = new Map(
    (metricsCc?.rows ?? []).map((row) => {
      const categories: ScheduleCostByCategory = { ...EMPTY_CATEGORY };
      for (const bucket of row.byCostType) categories[bucket.costType] = bucket.budgetTotalCost;
      return [row.wbsNodeId, categories] as const;
    }),
  );
  const costByCategoryMs = mark(t);

  // Full-tree WBS for procurement risk siblings (before URL filters shrink the list).
  const rollupWbsByItemId = new Map(rollupSourceItems.map((i) => [i.id, [] as string[]]));
  const filteredItemIds = new Set(items.map((i) => i.id));
  for (const item of items) {
    rollupWbsByItemId.set(
      item.id,
      item.wbsLinks.map((l) => l.wbsNodeId),
    );
  }
  const missingWbsItemIds = rollupSourceItems
    .filter((i) => !filteredItemIds.has(i.id))
    .map((i) => i.id);
  if (missingWbsItemIds.length > 0 && budgetMetadata) {
    const extraLinks = await prisma.scheduleItemWbsLink.findMany({
      where: {
        scheduleItemId: { in: missingWbsItemIds },
        tenantId: ctx.tenantId,
        wbsNode: { budget: { tenantId: ctx.tenantId, projectId, ...companyScopeFilter(ctx) } },
      },
      select: { scheduleItemId: true, wbsNodeId: true },
    });
    for (const link of extraLinks) {
      const list = rollupWbsByItemId.get(link.scheduleItemId) ?? [];
      list.push(link.wbsNodeId);
      rollupWbsByItemId.set(link.scheduleItemId, list);
    }
  }

  const procurementWbsIds = [...new Set([...rollupWbsByItemId.values()].flat())];
  const procurementByWbs =
    gate.isEnabled("PROCUREMENT") && canViewProcurementCapability(ctx.roles)
      ? await loadProcurementDatesByWbs(projectId, ctx, procurementWbsIds)
      : new Map<string, ProcurementDateByWbs>();

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
                divideDecimal(multiplyDecimal(r.operationalProgressQty, "100"), r.budgetQty, 2),
              )
            : null;
          if (saleDec.gt(0)) {
            metrics.certifiedProgressPct = serializeProgressPct(
              divideDecimal(multiplyDecimal(r.certifiedApproved, "100"), r.budgetTotalSale, 2),
            );
          }
        }
      }
      // linked but no cost rows (orphan WBS ids) → metrics stay null; never fabricate zeros
    }

    const wbsIds = wbsLinks.map((l) => l.wbsNodeId);
    let procurement: ScheduleWorkspaceItemDto["procurement"] = null;
    if (wbsIds.length > 0) {
      const dates = mergeProcurementDatesByWbs(wbsIds, procurementByWbs);
      procurement = {
        expectedDeliveryDate: dates.expectedDeliveryDate,
        latestReceiptDate: dates.latestReceiptDate,
        deliveryAfterSiblingStart: false, // filled after all DTOs + full-tree risk inputs
      };
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
      isLeaf,
      treeDepth: treeDepthOf(item.id),
      wbsLinks,
      metrics,
      predecessorIds: item.predecessors.map((p) => p.predecessorId),
      successorIds: item.successors.map((s) => s.successorId),
      predecessorDependencies: item.predecessors.map((p) => ({
        dependencyId: p.id,
        predecessorId: p.predecessorId,
      })),
      procurement,
    });
  }

  // Risk against full schedule tree, per shared WBS ([D-104]).
  const riskPeers = rollupSourceItems.map((i) => ({
    id: i.id,
    parentId: i.parentId,
    type: i.type,
    status: i.status,
    startDate: formatDateOnly(i.startDate),
    wbsNodeIds: rollupWbsByItemId.get(i.id) ?? [],
  }));
  const expectedByWbs = new Map(
    [...procurementByWbs.entries()].map(([id, row]) => [id, row.expectedDeliveryDate]),
  );

  const isLeafFn = (id: string) => isScheduleLeafItem(rollupSourceItems, id);
  for (const dto of dtoItems) {
    if (!dto.procurement) continue;
    dto.procurement.deliveryAfterSiblingStart = computeDeliveryAfterSiblingStart(
      {
        id: dto.id,
        parentId: dto.parentId,
        wbsNodeIds: dto.wbsLinks.map((l) => l.wbsNodeId),
      },
      riskPeers,
      isLeafFn,
      expectedByWbs,
    );
    // Collapse to null when there is nothing to show (no dates, no risk).
    if (
      !dto.procurement.expectedDeliveryDate &&
      !dto.procurement.latestReceiptDate &&
      !dto.procurement.deliveryAfterSiblingStart
    ) {
      dto.procurement = null;
    }
  }

  mergeDerivedContainerDatesIntoDtos(dtoItems, rollupSourceItems);

  // Former containers clear stale DB dates in merge — drop daysLate that used those dates.
  for (const dto of dtoItems) {
    if (!dto.isLeaf || !dto.endDate) {
      dto.daysLate = null;
    }
  }

  // delayedOnly may have included former-container rows before merge; drop them now.
  if (filters.delayedOnly) {
    for (let i = dtoItems.length - 1; i >= 0; i--) {
      if (dtoItems[i]!.daysLate == null) dtoItems.splice(i, 1);
    }
  }

  const treeItems: ScheduleTreeItemDto[] = rollupSourceItems
    .filter((i) => i.status !== "CANCELLED")
    .map((i) => ({
      id: i.id,
      parentId: i.parentId,
      sortOrder: i.sortOrder,
      status: i.status,
      name: i.name,
      type: i.type,
      isLeaf: isScheduleLeafItem(rollupSourceItems, i.id),
      wbsNodeIds: rollupWbsByItemId.get(i.id) ?? [],
    }));

  const activeItems = dtoItems.filter((i) => i.status !== "CANCELLED");
  const { completedItems, delayedItems, scheduleProgressPct } = summarizeScheduleLeaves(rollupSourceItems);

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
    budgetId: budgetMetadata?.id ?? null,
    budgetName: budgetMetadata?.name ?? null,
    budgetStatus: budgetMetadata?.status ?? null,
    budgetCurrency,
    metricsWarning,
    availableBudgets,
    canEdit,
    items: sortTreeOrder(dtoItems, (a, b) => a.name.localeCompare(b.name, "es")),
    treeItems,
    summary: {
      totalItems: activeItems.length,
      unfilteredActiveCount,
      completedItems,
      delayedItems,
      scheduleProgressPct,
    },
  };
}

type ScheduleSummarySource = {
  id: string;
  parentId: string | null;
  status: ScheduleItemStatus;
  endDate: Date | null;
  durationDays: number | null;
  progressPct: Prisma.Decimal;
};

function summarizeScheduleLeaves(items: ScheduleSummarySource[]) {
  // Leaf KPIs from the full tree (D-046), regardless of status filters.
  const activeParents = new Set(items.filter((i) => i.status !== "CANCELLED").map((i) => i.parentId));
  const parents = new Set(items.map((i) => i.parentId));
  let completedItems = 0;
  let delayedItems = 0;
  let weighted = "0";
  let weightSum = "0";
  for (const item of items) {
    if (item.status === "CANCELLED" || activeParents.has(item.id)) continue;
    if (item.status === "COMPLETED") completedItems += 1;
    // Former containers have no reliable end date or duration.
    const former = parents.has(item.id);
    if (!former && computeDaysLate(item.endDate, item.status) !== null) delayedItems += 1;
    const duration = !former && item.durationDays && item.durationDays > 0 ? String(item.durationDays) : "1";
    weighted = addDecimal(weighted, multiplyDecimal(item.progressPct.toString(), duration));
    weightSum = addDecimal(weightSum, duration);
  }
  const scheduleProgressPct = new Prisma.Decimal(weightSum).greaterThan(0)
    ? serializeProgressPct(divideDecimal(weighted, weightSum, 2))
    : null;
  return { completedItems, delayedItems, scheduleProgressPct };
}

/** Overview KPIs read the same leaves as the workspace without seeding a schedule or baseline. */
export async function getProjectScheduleSummary(
  projectId: string,
  ctx: ServiceContext,
) {
  const schedule = await findScheduleForProject(projectId, ctx);
  if (!schedule) return summarizeScheduleLeaves([]);
  const items = await prisma.scheduleItem.findMany({
    where: { tenantId: ctx.tenantId, scheduleId: schedule.id },
    select: { id: true, parentId: true, status: true, endDate: true, durationDays: true, progressPct: true },
  });
  return summarizeScheduleLeaves(items);
}
