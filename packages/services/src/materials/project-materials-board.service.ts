import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import {
  addCalendarDays,
  calendarPartsInTimeZone,
  formatCalendarDate,
  PRODUCT_TIMEZONE,
} from "@bloqer/utils";
import { canViewProjectCostControlReport } from "../project/project-nav-guards";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import { ServiceContext, ServiceError } from "../types";
import { resolveApprovedBudgetForProject } from "../reports/report-budget-resolve";
import { serializeMoneyDecimal } from "../finance/money-decimal";

export type MaterialsBoardWindow = "this_week" | "next_14_days" | "month" | "all";

export type MaterialsBoardFilters = {
  budgetId?: string;
  window?: MaterialsBoardWindow;
  wbsNodeId?: string;
  search?: string;
};

export type MaterialsBoardRow = {
  rowKey: string;
  wbsNodeId: string;
  wbsCode: string;
  wbsName: string;
  productId: string | null;
  description: string;
  needQty: string;
  needCost: string;
  orderedQty: string;
  receivedQty: string;
  consumedQty: string;
  shortfallQty: string;
  missingProduct: boolean;
  unscheduled: boolean;
  overCommitted: boolean;
};

export type MaterialsBoardReport = {
  type: "REPORT";
  projectId: string;
  budgetId: string;
  budgetName: string;
  window: MaterialsBoardWindow;
  windowStart: string | null;
  windowEnd: string | null;
  rows: MaterialsBoardRow[];
  totals: {
    needCost: string;
    orderedQty: string;
    receivedQty: string;
    consumedQty: string;
    shortfallRows: number;
  };
  warnings: string[];
};

export type MaterialsBoardEmpty = { type: "NO_APPROVED_BUDGETS" };

export type MaterialsBoardResult = MaterialsBoardReport | MaterialsBoardEmpty;

const ZERO = new Prisma.Decimal(0);
const ORDERED_PO_STATUSES = ["CONFIRMED", "PARTIALLY_RECEIVED", "RECEIVED"] as const;
const ORDERED_PR_STATUSES = ["SUBMITTED", "QUOTE_SELECTED"] as const;

/** Inclusive calendar day → UTC midnight (stable for date-only schedule overlap). */
function calendarDayStartUtc(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, 0, 0, 0, 0));
}

function calendarDayEndUtc(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, 23, 59, 59, 999));
}

/** Windows in product TZ (America/Argentina/Buenos_Aires) — avoids UTC off-by-one. */
function resolveWindow(window: MaterialsBoardWindow): { start: Date | null; end: Date | null } {
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
  // month (calendar month in product TZ)
  const startIso = `${today.year}-${String(today.month).padStart(2, "0")}-01`;
  const nextMonth = addCalendarDays(
    { year: today.year, month: today.month, day: 1 },
    32,
  );
  const lastOfMonth = addCalendarDays(
    { year: nextMonth.year, month: nextMonth.month, day: 1 },
    -1,
  );
  return {
    start: calendarDayStartUtc(startIso),
    end: calendarDayEndUtc(formatCalendarDate(lastOfMonth)),
  };
}

function normalizeDesc(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function rowKey(wbsNodeId: string, productId: string | null, description: string): string {
  return `${wbsNodeId}::${productId ?? `d:${normalizeDesc(description)}`}`;
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

export async function getProjectMaterialsBoard(
  projectId: string,
  filters: MaterialsBoardFilters,
  ctx: ServiceContext,
): Promise<MaterialsBoardResult> {
  if (!canViewProjectCostControlReport(ctx.roles) && !can(ctx.roles, "VIEW", "PROJECTS")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver materiales del proyecto");
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

  const budget = await resolveApprovedBudgetForProject(projectId, filters.budgetId, ctx);
  if (!budget) return { type: "NO_APPROVED_BUDGETS" };

  const window = filters.window ?? "next_14_days";
  const { start: winStart, end: winEnd } = resolveWindow(window);
  const warnings: string[] = [];

  const wbsLeaves = await prisma.wbsNode.findMany({
    where: {
      budgetId: budget.id,
      type: "ITEM",
      ...(filters.wbsNodeId ? { id: filters.wbsNodeId } : {}),
    },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });

  const costItems = await prisma.costItem.findMany({
    where: { budgetId: budget.id, wbsNode: { type: "ITEM" } },
    select: {
      wbsNodeId: true,
      quantity: true,
      analysisLines: {
        where: { category: "MATERIAL" },
        select: {
          productId: true,
          description: true,
          coefficient: true,
          totalCost: true,
        },
      },
    },
  });

  type Agg = {
    wbsNodeId: string;
    productId: string | null;
    description: string;
    needQty: Prisma.Decimal;
    needCost: Prisma.Decimal;
    orderedQty: Prisma.Decimal;
    receivedQty: Prisma.Decimal;
    consumedQty: Prisma.Decimal;
  };

  const map = new Map<string, Agg>();

  for (const item of costItems) {
    for (const line of item.analysisLines) {
      const key = rowKey(item.wbsNodeId, line.productId, line.description);
      const needQty = new Prisma.Decimal(line.coefficient).mul(item.quantity);
      const needCost = new Prisma.Decimal(line.totalCost).mul(item.quantity);
      const prev = map.get(key);
      if (prev) {
        prev.needQty = prev.needQty.add(needQty);
        prev.needCost = prev.needCost.add(needCost);
      } else {
        map.set(key, {
          wbsNodeId: item.wbsNodeId,
          productId: line.productId,
          description: line.description,
          needQty,
          needCost,
          orderedQty: ZERO,
          receivedQty: ZERO,
          consumedQty: ZERO,
        });
      }
    }
  }

  const ensureRow = (
    wbsNodeId: string,
    productId: string | null,
    description: string,
  ): Agg => {
    const key = rowKey(wbsNodeId, productId, description);
    let row = map.get(key);
    if (!row) {
      row = {
        wbsNodeId,
        productId,
        description,
        needQty: ZERO,
        needCost: ZERO,
        orderedQty: ZERO,
        receivedQty: ZERO,
        consumedQty: ZERO,
      };
      map.set(key, row);
    }
    return row;
  };

  const [prLines, poLines, consumptions, scheduleLinks] = await Promise.all([
    prisma.purchaseRequestLine.findMany({
      where: {
        purchaseRequest: {
          projectId,
          tenantId: ctx.tenantId,
          status: { in: [...ORDERED_PR_STATUSES] },
        },
        wbsNodeId: { not: null },
      },
      select: {
        wbsNodeId: true,
        productId: true,
        description: true,
        quantity: true,
      },
    }),
    prisma.purchaseOrderLine.findMany({
      where: {
        purchaseOrder: {
          projectId,
          tenantId: ctx.tenantId,
          status: { in: [...ORDERED_PO_STATUSES] },
        },
        wbsNodeId: { not: null },
      },
      select: {
        wbsNodeId: true,
        productId: true,
        description: true,
        quantity: true,
        receivedQuantity: true,
      },
    }),
    gate.isEnabled("INVENTORY")
      ? prisma.stockMovement.findMany({
          where: {
            projectId,
            tenantId: ctx.tenantId,
            status: "CONFIRMED",
            type: "OUT",
            sourceType: "CONSUMPTION",
            wbsNodeId: { not: null },
          },
          select: {
            wbsNodeId: true,
            productId: true,
            notes: true,
            quantity: true,
          },
        })
      : Promise.resolve([]),
    gate.isEnabled("SCHEDULE")
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
      : Promise.resolve([]),
  ]);

  for (const line of prLines) {
    if (!line.wbsNodeId) continue;
    const row = ensureRow(line.wbsNodeId, line.productId, line.description);
    row.orderedQty = row.orderedQty.add(line.quantity);
  }
  for (const line of poLines) {
    if (!line.wbsNodeId) continue;
    const row = ensureRow(line.wbsNodeId, line.productId, line.description);
    row.orderedQty = row.orderedQty.add(line.quantity);
    row.receivedQty = row.receivedQty.add(line.receivedQuantity);
  }
  for (const sm of consumptions) {
    if (!sm.wbsNodeId) continue;
    // Prefer productId key; notes text is fragile for matching APU descriptions.
    if (sm.productId) {
      const byProduct = [...map.values()].find(
        (r) => r.wbsNodeId === sm.wbsNodeId && r.productId === sm.productId,
      );
      if (byProduct) {
        byProduct.consumedQty = byProduct.consumedQty.add(sm.quantity);
        continue;
      }
    }
    const noteParts = sm.notes?.split(" · ") ?? [];
    const desc = noteParts.length >= 2 ? noteParts[1]! : "Consumo";
    const row = ensureRow(sm.wbsNodeId, sm.productId, desc);
    row.consumedQty = row.consumedQty.add(sm.quantity);
  }

  const wbsInWindow = new Set<string>();
  const wbsScheduled = new Set<string>();
  if (winStart && winEnd) {
    for (const link of scheduleLinks) {
      wbsScheduled.add(link.wbsNodeId);
      if (
        rangesOverlap(
          link.scheduleItem.startDate,
          link.scheduleItem.endDate,
          winStart,
          winEnd,
        )
      ) {
        wbsInWindow.add(link.wbsNodeId);
      }
    }
  } else {
    for (const link of scheduleLinks) {
      wbsScheduled.add(link.wbsNodeId);
      wbsInWindow.add(link.wbsNodeId);
    }
  }

  if (window !== "all" && scheduleLinks.length === 0) {
    warnings.push(
      "Sin tareas de cronograma vinculadas a WBS: se muestran todas las partidas (bucket sin fecha).",
    );
  }

  const wbsMeta = new Map(wbsLeaves.map((w) => [w.id, w]));
  const search = filters.search?.trim().toLowerCase();

  let rows: MaterialsBoardRow[] = [];
  for (const agg of map.values()) {
    const meta = wbsMeta.get(agg.wbsNodeId);
    if (!meta) continue;
    if (filters.wbsNodeId && agg.wbsNodeId !== filters.wbsNodeId) continue;

    const unscheduled = !wbsScheduled.has(agg.wbsNodeId);
    // Scheduled WBS must overlap the window; unscheduled stay visible (flagged "sin fecha").
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

    const shortfall = Prisma.Decimal.max(ZERO, agg.needQty.sub(agg.orderedQty));
    rows.push({
      rowKey: rowKey(agg.wbsNodeId, agg.productId, agg.description),
      wbsNodeId: agg.wbsNodeId,
      wbsCode: meta.code,
      wbsName: meta.name,
      productId: agg.productId,
      description: agg.description,
      needQty: agg.needQty.toFixed(4),
      needCost: serializeMoneyDecimal(agg.needCost),
      orderedQty: agg.orderedQty.toFixed(4),
      receivedQty: agg.receivedQty.toFixed(4),
      consumedQty: agg.consumedQty.toFixed(4),
      shortfallQty: shortfall.toFixed(4),
      missingProduct: !agg.productId,
      unscheduled,
      overCommitted: agg.orderedQty.greaterThan(agg.needQty) && agg.needQty.greaterThan(0),
    });
  }

  rows = rows.sort((a, b) => a.wbsCode.localeCompare(b.wbsCode) || a.description.localeCompare(b.description));

  const totNeed = rows.reduce((s, r) => s.add(r.needCost), ZERO);
  const totOrd = rows.reduce((s, r) => s.add(r.orderedQty), ZERO);
  const totRec = rows.reduce((s, r) => s.add(r.receivedQty), ZERO);
  const totCons = rows.reduce((s, r) => s.add(r.consumedQty), ZERO);

  return {
    type: "REPORT",
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
      receivedQty: totRec.toFixed(4),
      consumedQty: totCons.toFixed(4),
      shortfallRows: rows.filter((r) => !/^-?0+(\.0+)?$/.test(r.shortfallQty.trim())).length,
    },
    warnings,
  };
}
