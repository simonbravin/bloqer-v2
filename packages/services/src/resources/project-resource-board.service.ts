import { Prisma, prisma } from "@bloqer/database";
import { can, physicalNeedQty } from "@bloqer/domain";
import {
  addCalendarDays,
  calendarPartsInTimeZone,
  formatCalendarDate,
  PRODUCT_TIMEZONE,
  toIsoDateInTimeZone,
} from "@bloqer/utils";
import { uniqueRelatedId } from "../materials/materials-field";
import {
  MATERIAL_ORDERED_PO_STATUSES,
  MATERIAL_ORDERED_PR_STATUSES,
} from "../materials/material-commitment-pure";
import { compareWbsCodes } from "../budget/wbs-code-rules";
import { canViewProjectCostControlReport } from "../project/project-nav-guards";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import { ServiceContext, ServiceError } from "../types";
import { resolveApprovedBudgetForProject } from "../reports/report-budget-resolve";
import { serializeMoneyDecimal } from "../finance/money-decimal";
import {
  asCostCategory,
  resourceFallbackRowKey,
  resourceRowKey,
  RESOURCE_BOARD_LABELS_ES,
  type ResourceBoardCategory,
} from "./resource-board-pure";

export type ResourceBoardWindow = "this_week" | "next_14_days" | "month" | "all";

export type ResourceBoardFilters = {
  budgetId?: string;
  window?: ResourceBoardWindow;
  wbsNodeId?: string;
  search?: string;
  /** Skip cronograma links (EDT drilldown qty-only path). */
  skipSchedule?: boolean;
};

export type ResourceBoardRow = {
  rowKey: string;
  wbsNodeId: string;
  wbsCode: string;
  wbsName: string;
  costAnalysisLineId: string | null;
  description: string;
  unit: string | null;
  needQty: string;
  needCost: string;
  orderedQty: string;
  invoicedQty: string;
  shortfallQty: string;
  requiredStart: string | null;
  requiredEnd: string | null;
  unscheduled: boolean;
  overCommitted: boolean;
  relatedPurchaseRequestId: string | null;
  relatedPurchaseRequestNumber: number | null;
  relatedPurchaseOrderId: string | null;
  relatedPurchaseOrderNumber: number | null;
  relatedSupplierInvoiceId: string | null;
  relatedSupplierInvoiceNumber: number | null;
};

export type ResourceBoardReport = {
  type: "REPORT";
  costCategory: ResourceBoardCategory;
  categoryLabel: string;
  projectId: string;
  budgetId: string;
  budgetName: string;
  window: ResourceBoardWindow;
  windowStart: string | null;
  windowEnd: string | null;
  rows: ResourceBoardRow[];
  totals: {
    needCost: string;
    orderedQty: string;
    invoicedQty: string;
    shortfallRows: number;
  };
  warnings: string[];
};

export type ResourceBoardEmpty = { type: "NO_APPROVED_BUDGETS"; costCategory: ResourceBoardCategory };

export type ResourceBoardResult = ResourceBoardReport | ResourceBoardEmpty;

const ZERO = new Prisma.Decimal(0);
const ORDERED_PO_STATUSES = MATERIAL_ORDERED_PO_STATUSES;
const ORDERED_PR_STATUSES = MATERIAL_ORDERED_PR_STATUSES;

function calendarDayStartUtc(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, 0, 0, 0, 0));
}

function calendarDayEndUtc(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, 23, 59, 59, 999));
}

function resolveWindow(window: ResourceBoardWindow): { start: Date | null; end: Date | null } {
  if (window === "all") return { start: null, end: null };
  const now = new Date();
  const today = calendarPartsInTimeZone(now, PRODUCT_TIMEZONE);
  const todayIso = formatCalendarDate(today);

  if (window === "this_week") {
    const wd = new Intl.DateTimeFormat("en-US", {
      timeZone: PRODUCT_TIMEZONE,
      weekday: "short",
    }).format(now);
    const dayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    const mondayOffset = ((dayMap[wd] ?? 0) + 6) % 7;
    const startParts = addCalendarDays(today, -mondayOffset);
    const endParts = addCalendarDays(startParts, 6);
    return {
      start: calendarDayStartUtc(formatCalendarDate(startParts)),
      end: calendarDayEndUtc(formatCalendarDate(endParts)),
    };
  }
  if (window === "next_14_days") {
    const endParts = addCalendarDays(today, 13);
    return {
      start: calendarDayStartUtc(todayIso),
      end: calendarDayEndUtc(formatCalendarDate(endParts)),
    };
  }
  const startIso = `${today.year}-${String(today.month).padStart(2, "0")}-01`;
  const nextMonth = addCalendarDays({ year: today.year, month: today.month, day: 1 }, 32);
  const lastOfMonth = addCalendarDays({ year: nextMonth.year, month: nextMonth.month, day: 1 }, -1);
  return {
    start: calendarDayStartUtc(startIso),
    end: calendarDayEndUtc(formatCalendarDate(lastOfMonth)),
  };
}

function rangesOverlap(
  aStart: Date | null,
  aEnd: Date | null,
  bStart: Date,
  bEnd: Date,
): boolean {
  if (!aStart && !aEnd) return true;
  const s = aStart ?? aEnd!;
  const e = aEnd ?? aStart!;
  return s <= bEnd && e >= bStart;
}

/**
 * Operational board for APU LABOR / EQUIPMENT lines ([D-099]).
 * Quantities only — dollars live in EDT. Coverage = max(ordered, invoiced).
 */
export async function getProjectResourceBoard(
  projectId: string,
  costCategory: ResourceBoardCategory,
  filters: ResourceBoardFilters,
  ctx: ServiceContext,
): Promise<ResourceBoardResult> {
  if (!canViewProjectCostControlReport(ctx.roles) && !can(ctx.roles, "VIEW", "PROJECTS")) {
    throw new ServiceError(
      "FORBIDDEN",
      `Sin permisos para ver ${RESOURCE_BOARD_LABELS_ES[costCategory].toLowerCase()} del proyecto`,
    );
  }

  const gate = await getTenantModuleGate(ctx);
  if (!gate.isEnabled("BUDGETS") || !gate.isEnabled("PROJECTS")) {
    throw new ServiceError("FORBIDDEN", "Presupuestos o proyectos deshabilitados");
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId: ctx.tenantId },
    select: { id: true },
  });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");

  const category = asCostCategory(costCategory);
  const budget = await resolveApprovedBudgetForProject(projectId, filters.budgetId, ctx);
  if (!budget) return { type: "NO_APPROVED_BUDGETS", costCategory };

  const window = filters.window ?? "next_14_days";
  const { start: winStart, end: winEnd } = resolveWindow(window);
  const warnings: string[] = [];
  const scopeWbsId = filters.wbsNodeId;

  const wbsLeaves = await prisma.wbsNode.findMany({
    where: {
      budgetId: budget.id,
      type: "ITEM",
      ...(scopeWbsId ? { id: scopeWbsId } : {}),
    },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });

  const costItems = await prisma.costItem.findMany({
    where: {
      budgetId: budget.id,
      wbsNode: {
        type: "ITEM",
        ...(scopeWbsId ? { id: scopeWbsId } : {}),
      },
    },
    select: {
      wbsNodeId: true,
      quantity: true,
      analysisLines: {
        where: { category },
        select: {
          id: true,
          description: true,
          coefficient: true,
          totalCost: true,
          partidaQuantity: true,
          isLumpSum: true,
          unit: true,
        },
      },
    },
  });

  type Agg = {
    wbsNodeId: string;
    costAnalysisLineId: string | null;
    description: string;
    unit: string | null;
    needQty: Prisma.Decimal;
    needCost: Prisma.Decimal;
    orderedQty: Prisma.Decimal;
    invoicedQty: Prisma.Decimal;
  };

  const map = new Map<string, Agg>();
  const byApuId = new Map<string, Agg>();
  const fallbackCounts = new Map<string, string[]>();

  for (const item of costItems) {
    for (const line of item.analysisLines) {
      const needQty = new Prisma.Decimal(
        physicalNeedQty(
          line.partidaQuantity != null ? Number(line.partidaQuantity.toString()) : null,
          Number(line.coefficient.toString()),
          Number(item.quantity.toString()),
          { isLumpSum: line.isLumpSum, unit: line.unit },
        ),
      );
      if (needQty.isZero()) continue;
      const needCost = new Prisma.Decimal(line.totalCost).mul(item.quantity);
      const key = resourceRowKey(item.wbsNodeId, line.id, line.description);
      const agg: Agg = {
        wbsNodeId: item.wbsNodeId,
        costAnalysisLineId: line.id,
        description: line.description,
        unit: line.unit,
        needQty,
        needCost,
        orderedQty: ZERO,
        invoicedQty: ZERO,
      };
      map.set(key, agg);
      byApuId.set(line.id, agg);
      const fb = resourceFallbackRowKey(item.wbsNodeId, line.description);
      const list = fallbackCounts.get(fb) ?? [];
      list.push(line.id);
      fallbackCounts.set(fb, list);
    }
  }

  const uniqueFallback = new Map<string, string>();
  for (const [fb, ids] of fallbackCounts) {
    if (ids.length === 1) uniqueFallback.set(fb, ids[0]!);
  }

  const resolveAgg = (
    wbsNodeId: string,
    description: string,
    costAnalysisLineId: string | null,
  ): Agg | null => {
    if (costAnalysisLineId) {
      const hit = byApuId.get(costAnalysisLineId);
      if (hit) return hit;
    }
    const fb = resourceFallbackRowKey(wbsNodeId, description);
    const apuId = uniqueFallback.get(fb);
    if (apuId) return byApuId.get(apuId) ?? null;
    return null;
  };

  const ensureOrphan = (
    wbsNodeId: string,
    description: string,
    costAnalysisLineId: string | null,
  ): Agg => {
    const existing = resolveAgg(wbsNodeId, description, costAnalysisLineId);
    if (existing) return existing;
    const key = resourceRowKey(wbsNodeId, costAnalysisLineId, description);
    let row = map.get(key);
    if (!row) {
      row = {
        wbsNodeId,
        costAnalysisLineId,
        description,
        unit: null,
        needQty: ZERO,
        needCost: ZERO,
        orderedQty: ZERO,
        invoicedQty: ZERO,
      };
      map.set(key, row);
      if (costAnalysisLineId) byApuId.set(costAnalysisLineId, row);
    }
    return row;
  };

  const [prLines, poLines, invoiceLines, scheduleLinks] = await Promise.all([
    prisma.purchaseRequestLine.findMany({
      where: {
        purchaseRequest: {
          projectId,
          tenantId: ctx.tenantId,
          status: { in: [...ORDERED_PR_STATUSES] },
          purchaseOrders: {
            none: { status: { in: [...ORDERED_PO_STATUSES] } },
          },
        },
        wbsNodeId: scopeWbsId ? scopeWbsId : { not: null },
        OR: [
          { costType: category },
          { costAnalysisLine: { category } },
        ],
      },
      select: {
        wbsNodeId: true,
        costAnalysisLineId: true,
        description: true,
        quantity: true,
        purchaseRequest: { select: { id: true, number: true } },
      },
    }),
    prisma.purchaseOrderLine.findMany({
      where: {
        purchaseOrder: {
          projectId,
          tenantId: ctx.tenantId,
          status: { in: [...ORDERED_PO_STATUSES] },
        },
        wbsNodeId: scopeWbsId ? scopeWbsId : { not: null },
        OR: [
          { costType: category },
          { costAnalysisLine: { category } },
        ],
      },
      select: {
        id: true,
        wbsNodeId: true,
        costAnalysisLineId: true,
        description: true,
        quantity: true,
        purchaseOrder: { select: { id: true, number: true } },
      },
    }),
    prisma.supplierInvoiceLine.findMany({
      where: {
        invoice: {
          projectId,
          tenantId: ctx.tenantId,
          status: "ISSUED",
          // Subcontract cert invoices are always SUB — exclude for safety.
          subcontractCertificationId: null,
        },
        wbsNodeId: scopeWbsId ? scopeWbsId : { not: null },
        OR: [
          { costType: category },
          // Inherit from OC only when the invoice line has no explicit costType
          // (avoids attributing MATERIAL invoices onto LABOR/EQUIPMENT boards).
          {
            AND: [
              { costType: null },
              {
                purchaseOrderLine: {
                  OR: [{ costType: category }, { costAnalysisLine: { category } }],
                },
              },
            ],
          },
        ],
      },
      select: {
        wbsNodeId: true,
        description: true,
        quantity: true,
        costAnalysisLineId: true,
        purchaseOrderLineId: true,
        purchaseOrderLine: {
          select: { costAnalysisLineId: true, description: true },
        },
        invoice: { select: { id: true, number: true } },
      },
    }),
    gate.isEnabled("SCHEDULE") && !filters.skipSchedule && !scopeWbsId
      ? prisma.scheduleItemWbsLink.findMany({
          where: {
            wbsNode: { budgetId: budget.id },
            scheduleItem: {
              schedule: { projectId, tenantId: ctx.tenantId },
              status: { not: "CANCELLED" },
            },
          },
          select: {
            wbsNodeId: true,
            scheduleItem: { select: { startDate: true, endDate: true } },
          },
        })
      : gate.isEnabled("SCHEDULE") && !filters.skipSchedule && scopeWbsId
        ? prisma.scheduleItemWbsLink.findMany({
            where: {
              wbsNodeId: scopeWbsId,
              scheduleItem: {
                schedule: { projectId, tenantId: ctx.tenantId },
                status: { not: "CANCELLED" },
              },
            },
            select: {
              wbsNodeId: true,
              scheduleItem: { select: { startDate: true, endDate: true } },
            },
          })
        : Promise.resolve([]),
  ]);

  const prIdsByCal = new Map<string, string[]>();
  const prNumberById = new Map<string, number>();
  const poIdsByCal = new Map<string, string[]>();
  const poNumberById = new Map<string, number>();
  const invIdsByCal = new Map<string, string[]>();
  const invNumberById = new Map<string, number>();
  const poLineToApu = new Map<string, string | null>();

  for (const line of prLines) {
    if (!line.wbsNodeId) continue;
    const row = ensureOrphan(line.wbsNodeId, line.description, line.costAnalysisLineId);
    row.orderedQty = row.orderedQty.add(line.quantity);
    if (row.costAnalysisLineId) {
      const list = prIdsByCal.get(row.costAnalysisLineId) ?? [];
      list.push(line.purchaseRequest.id);
      prIdsByCal.set(row.costAnalysisLineId, list);
      prNumberById.set(line.purchaseRequest.id, line.purchaseRequest.number);
    }
  }

  for (const line of poLines) {
    if (!line.wbsNodeId) continue;
    const row = ensureOrphan(line.wbsNodeId, line.description, line.costAnalysisLineId);
    row.orderedQty = row.orderedQty.add(line.quantity);
    poLineToApu.set(line.id, row.costAnalysisLineId);
    if (row.costAnalysisLineId) {
      const list = poIdsByCal.get(row.costAnalysisLineId) ?? [];
      list.push(line.purchaseOrder.id);
      poIdsByCal.set(row.costAnalysisLineId, list);
      poNumberById.set(line.purchaseOrder.id, line.purchaseOrder.number);
    }
  }

  for (const line of invoiceLines) {
    if (!line.wbsNodeId) continue;
    const fromPo =
      line.purchaseOrderLineId != null
        ? (poLineToApu.get(line.purchaseOrderLineId) ??
          line.purchaseOrderLine?.costAnalysisLineId ??
          null)
        : null;
    // Prefer explicit APU hint on the invoice line ([D-110]).
    const apuId = line.costAnalysisLineId ?? fromPo;
    const desc = line.purchaseOrderLine?.description ?? line.description;
    const row = ensureOrphan(line.wbsNodeId, desc, apuId);
    row.invoicedQty = row.invoicedQty.add(line.quantity);
    if (row.costAnalysisLineId) {
      const list = invIdsByCal.get(row.costAnalysisLineId) ?? [];
      list.push(line.invoice.id);
      invIdsByCal.set(row.costAnalysisLineId, list);
      invNumberById.set(line.invoice.id, line.invoice.number);
    }
  }

  const wbsRequired = new Map<string, { start: Date; end: Date }>();
  const wbsInWindow = new Set<string>();
  const wbsScheduled = new Set<string>();
  if (winStart && winEnd) {
    for (const link of scheduleLinks) {
      wbsScheduled.add(link.wbsNodeId);
      const start = link.scheduleItem.startDate;
      const end = link.scheduleItem.endDate;
      if (start || end) {
        const s = start ?? end!;
        const e = end ?? start!;
        const prev = wbsRequired.get(link.wbsNodeId);
        if (!prev) wbsRequired.set(link.wbsNodeId, { start: s, end: e });
        else {
          if (s < prev.start) prev.start = s;
          if (e > prev.end) prev.end = e;
        }
      }
      if (rangesOverlap(link.scheduleItem.startDate, link.scheduleItem.endDate, winStart, winEnd)) {
        wbsInWindow.add(link.wbsNodeId);
      }
    }
  } else {
    for (const link of scheduleLinks) {
      wbsScheduled.add(link.wbsNodeId);
      wbsInWindow.add(link.wbsNodeId);
      const start = link.scheduleItem.startDate;
      const end = link.scheduleItem.endDate;
      if (start || end) {
        const s = start ?? end!;
        const e = end ?? start!;
        const prev = wbsRequired.get(link.wbsNodeId);
        if (!prev) wbsRequired.set(link.wbsNodeId, { start: s, end: e });
        else {
          if (s < prev.start) prev.start = s;
          if (e > prev.end) prev.end = e;
        }
      }
    }
  }

  if (window !== "all" && scheduleLinks.length === 0) {
    warnings.push(
      "Sin tareas de cronograma vinculadas a EDT: se muestran todas las partidas (bucket sin fecha).",
    );
  }

  const wbsMeta = new Map(wbsLeaves.map((w) => [w.id, w]));
  const search = filters.search?.trim().toLowerCase();

  let rows: ResourceBoardRow[] = [];
  for (const agg of map.values()) {
    const meta = wbsMeta.get(agg.wbsNodeId);
    if (!meta) continue;
    if (filters.wbsNodeId && agg.wbsNodeId !== filters.wbsNodeId) continue;

    const unscheduled = !wbsScheduled.has(agg.wbsNodeId);
    const inWindow =
      window === "all" ||
      scheduleLinks.length === 0 ||
      wbsInWindow.has(agg.wbsNodeId) ||
      unscheduled;
    if (!inWindow) continue;

    if (
      search &&
      !meta.code.toLowerCase().includes(search) &&
      !meta.name.toLowerCase().includes(search) &&
      !agg.description.toLowerCase().includes(search)
    ) {
      continue;
    }

    const covered = Prisma.Decimal.max(agg.orderedQty, agg.invoicedQty);
    const shortfall = Prisma.Decimal.max(ZERO, agg.needQty.sub(covered));
    const required = wbsRequired.get(agg.wbsNodeId);
    const relatedPrId = agg.costAnalysisLineId
      ? uniqueRelatedId(prIdsByCal.get(agg.costAnalysisLineId) ?? [])
      : null;
    const relatedPoId = agg.costAnalysisLineId
      ? uniqueRelatedId(poIdsByCal.get(agg.costAnalysisLineId) ?? [])
      : null;
    const relatedInvId = agg.costAnalysisLineId
      ? uniqueRelatedId(invIdsByCal.get(agg.costAnalysisLineId) ?? [])
      : null;

    rows.push({
      rowKey: resourceRowKey(agg.wbsNodeId, agg.costAnalysisLineId, agg.description),
      wbsNodeId: agg.wbsNodeId,
      wbsCode: meta.code,
      wbsName: meta.name,
      costAnalysisLineId: agg.costAnalysisLineId,
      description: agg.description,
      unit: agg.unit,
      needQty: agg.needQty.toFixed(4),
      needCost: serializeMoneyDecimal(agg.needCost),
      orderedQty: agg.orderedQty.toFixed(4),
      invoicedQty: agg.invoicedQty.toFixed(4),
      shortfallQty: shortfall.toFixed(4),
      requiredStart: required ? toIsoDateInTimeZone(required.start) : null,
      requiredEnd: required ? toIsoDateInTimeZone(required.end) : null,
      unscheduled,
      overCommitted: covered.greaterThan(agg.needQty) && agg.needQty.greaterThan(0),
      relatedPurchaseRequestId: relatedPrId,
      relatedPurchaseRequestNumber: relatedPrId ? (prNumberById.get(relatedPrId) ?? null) : null,
      relatedPurchaseOrderId: relatedPoId,
      relatedPurchaseOrderNumber: relatedPoId ? (poNumberById.get(relatedPoId) ?? null) : null,
      relatedSupplierInvoiceId: relatedInvId,
      relatedSupplierInvoiceNumber: relatedInvId ? (invNumberById.get(relatedInvId) ?? null) : null,
    });
  }

  rows = rows.sort(
    (a, b) =>
      compareWbsCodes(a.wbsCode, b.wbsCode) ||
      a.description.localeCompare(b.description, "es"),
  );

  const totNeed = rows.reduce((s, r) => s.add(r.needCost), ZERO);
  const totOrd = rows.reduce((s, r) => s.add(r.orderedQty), ZERO);
  const totInv = rows.reduce((s, r) => s.add(r.invoicedQty), ZERO);

  return {
    type: "REPORT",
    costCategory,
    categoryLabel: RESOURCE_BOARD_LABELS_ES[costCategory],
    projectId,
    budgetId: budget.id,
    budgetName: budget.name,
    window,
    windowStart: winStart?.toISOString().slice(0, 10) ?? null,
    windowEnd: winEnd?.toISOString().slice(0, 10) ?? null,
    rows,
    totals: {
      needCost: serializeMoneyDecimal(totNeed),
      orderedQty: totOrd.toFixed(4),
      invoicedQty: totInv.toFixed(4),
      shortfallRows: rows.filter((r) => !/^-?0+(\.0+)?$/.test(r.shortfallQty.trim())).length,
    },
    warnings,
  };
}

/** Lightweight commitments for EDT drilldown (need / ordered / invoiced / shortfall). */
export async function getResourceApuCommitmentsForWbs(
  projectId: string,
  wbsNodeId: string,
  costCategory: ResourceBoardCategory,
  ctx: ServiceContext,
): Promise<
  Array<{
    costAnalysisLineId: string;
    description: string;
    unit: string;
    needQty: string;
    orderedQty: string;
    invoicedQty: string;
    shortfallQty: string;
    overCommitted: boolean;
  }>
> {
  // Scoped to one WBS + skip cronograma — avoids two full-project board loads in drilldown.
  const board = await getProjectResourceBoard(
    projectId,
    costCategory,
    { window: "all", wbsNodeId, skipSchedule: true },
    ctx,
  );
  if (board.type !== "REPORT") return [];
  return board.rows
    .filter((r) => r.costAnalysisLineId != null && r.wbsNodeId === wbsNodeId)
    .map((r) => ({
      costAnalysisLineId: r.costAnalysisLineId!,
      description: r.description,
      unit: r.unit ?? "",
      needQty: r.needQty,
      orderedQty: r.orderedQty,
      invoicedQty: r.invoicedQty,
      shortfallQty: r.shortfallQty,
      overCommitted: r.overCommitted,
    }));
}

/** Convenience wrappers for UI routes. */
export async function getProjectLaborBoard(
  projectId: string,
  filters: ResourceBoardFilters,
  ctx: ServiceContext,
): Promise<ResourceBoardResult> {
  return getProjectResourceBoard(projectId, "LABOR", filters, ctx);
}

export async function getProjectEquipmentBoard(
  projectId: string,
  filters: ResourceBoardFilters,
  ctx: ServiceContext,
): Promise<ResourceBoardResult> {
  return getProjectResourceBoard(projectId, "EQUIPMENT", filters, ctx);
}
