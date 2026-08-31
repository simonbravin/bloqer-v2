import { prisma } from "@bloqer/database";
import type { ScheduleItemStatus } from "@bloqer/database";
import { formatGroupedDecimal, toIsoDateInTimeZone } from "@bloqer/utils";
import type { ServiceContext } from "../types";
import { ServiceError } from "../types";
import { getProjectShellInfo } from "../project/project.service";
import { safeReportFilename } from "../report-exports/filename.service";
import type { ReportXlsxPayload } from "../report-exports/report-export.types";
import { buildStyledScheduleXlsx } from "./schedule-xlsx-styled";
import { resolveScheduleItemBarColor } from "./schedule-bar-color";
import {
  buildGanttAxisTicks,
  buildGanttPeriods,
  buildScheduleExportFilterLine,
  chooseGanttScale,
  computeExportDateRange,
  filterScheduleItemsForExport,
  formatScheduleExportDate,
  formatScheduleExportPct,
  indentScheduleExportName,
  keepScheduleItemsOverlappingRange,
  parseScheduleExportIsoDate,
  parseScheduleExportView,
  resolveExportGanttRange,
  SCHEDULE_EXPORT_STATUS_LABELS,
  scheduleExportTypeLabel,
  todayMarkerFraction,
  type ScheduleExportGantt,
  type ScheduleExportPayload,
  type ScheduleExportRow,
} from "./schedule-export-pure";
import {
  getProjectScheduleWorkspace,
  type ScheduleWorkspaceFilters,
  type ScheduleWorkspaceItemDto,
} from "./schedule-workspace.service";

const STATUS_VALUES: ScheduleItemStatus[] = [
  "PLANNED",
  "IN_PROGRESS",
  "BLOCKED",
  "COMPLETED",
  "CANCELLED",
];

export type ScheduleExportFilters = ScheduleWorkspaceFilters & {
  view?: string;
  from?: string;
  to?: string;
};

export type { ScheduleExportGantt, ScheduleExportPayload, ScheduleExportRow } from "./schedule-export-pure";

export function parseScheduleExportFilters(
  sp: Record<string, string | undefined>,
): ScheduleExportFilters {
  const status = STATUS_VALUES.includes(sp.status as ScheduleItemStatus)
    ? (sp.status as ScheduleItemStatus)
    : undefined;
  const itemType = sp.type === "TASK" || sp.type === "MILESTONE" ? sp.type : undefined;
  return {
    budgetId: sp.budgetId || undefined,
    delayedOnly: sp.delayedOnly === "1",
    status,
    itemType,
    view: sp.view,
    from: parseScheduleExportIsoDate(sp.from),
    to: parseScheduleExportIsoDate(sp.to),
  };
}

function moneyLabel(raw: string | null | undefined, currency: string): string {
  if (raw == null || raw === "") return "—";
  try {
    return `${formatGroupedDecimal(raw)} ${currency}`;
  } catch {
    return `${raw} ${currency}`;
  }
}

function durationLabel(days: number | null | undefined): string {
  if (days == null || days <= 0) return "—";
  return days === 1 ? "1 día" : `${days} días`;
}

function alertLabel(item: ScheduleWorkspaceItemDto): string {
  const bits: string[] = [];
  if (item.isLeaf && item.daysLate != null) bits.push(`Atrasado ${item.daysLate}d`);
  if (item.metrics?.overBudget) bits.push("Sobre PPTO");
  const committed = item.metrics?.committedCost;
  if (committed && committed !== "0.00" && !committed.startsWith("-")) bits.push("Compras");
  if (item.procurement?.deliveryAfterSiblingStart) bits.push("Entrega OC posterior");
  return bits.join("; ") || "—";
}

function primaryWbsCode(item: ScheduleWorkspaceItemDto): string {
  return item.wbsLinks.find((l) => l.isPrimary)?.wbsCode ?? "—";
}

function progressRatio(raw: string): number {
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(1, n / 100);
}

function mapRow(item: ScheduleWorkspaceItemDto, currency: string): ScheduleExportRow {
  const isMilestone = item.type === "MILESTONE";
  return {
    id: item.id,
    displayName: indentScheduleExportName(item.name, item.treeDepth),
    typeLabel: scheduleExportTypeLabel(item),
    type: item.type,
    isLeaf: item.isLeaf,
    isMilestone,
    statusLabel: SCHEDULE_EXPORT_STATUS_LABELS[item.status] ?? item.status,
    wbsCode: primaryWbsCode(item),
    startDate: item.startDate,
    endDate: item.endDate,
    startLabel: formatScheduleExportDate(item.startDate),
    endLabel: formatScheduleExportDate(item.endDate),
    durationLabel: durationLabel(item.durationDays),
    realPct: formatScheduleExportPct(item.progressPct),
    planPct: formatScheduleExportPct(item.timePlanPct),
    qtyPct: formatScheduleExportPct(item.metrics?.operationalProgressPct),
    certPct: formatScheduleExportPct(item.metrics?.certifiedProgressPct),
    budgetLabel: moneyLabel(item.metrics?.budgetTotalCost, currency),
    committedLabel: moneyLabel(item.metrics?.committedCost, currency),
    alerts: alertLabel(item),
    treeDepth: item.treeDepth,
    barColor: resolveScheduleItemBarColor(item, !item.isLeaf),
    progressRatio: progressRatio(item.progressPct),
  };
}

async function resolveOrgMeta(
  projectId: string,
  ctx: ServiceContext,
): Promise<{ orgLine: string; projectLabel: string }> {
  const shell = await getProjectShellInfo(projectId, ctx);
  const companyId = ctx.companyId ?? shell.companyId;
  const [tenantRow, companyRow] = await Promise.all([
    prisma.tenant.findFirst({
      where: { id: ctx.tenantId },
      select: { name: true },
    }),
    companyId
      ? prisma.company.findFirst({
          where: { id: companyId, tenantId: ctx.tenantId, status: "ACTIVE" },
          select: { name: true, legalName: true },
        })
      : Promise.resolve(null),
  ]);
  const tenantName = tenantRow?.name ?? "Organización";
  const companyDisplayName = companyRow
    ? companyRow.legalName?.trim() || companyRow.name
    : null;
  const orgLine =
    companyDisplayName && companyDisplayName !== tenantName
      ? `${companyDisplayName} · ${tenantName}`
      : tenantName;
  return {
    orgLine,
    projectLabel: `${shell.code} · ${shell.name}`,
  };
}

export async function buildScheduleExportPayload(
  projectId: string,
  filters: ScheduleExportFilters,
  ctx: ServiceContext,
): Promise<ScheduleExportPayload> {
  const workspace = await getProjectScheduleWorkspace(
    projectId,
    {
      budgetId: filters.budgetId,
      delayedOnly: filters.delayedOnly,
      status: filters.status,
      itemType: filters.itemType,
    },
    ctx,
  );
  if (workspace.type === "NO_APPROVED_BUDGETS") {
    throw new ServiceError("CONFLICT", "No hay presupuesto aprobado o cerrado para exportar el cronograma");
  }
  if (workspace.type === "BUDGET_SELECTION_REQUIRED") {
    throw new ServiceError("CONFLICT", "Seleccioná un presupuesto para exportar el cronograma");
  }

  const items = filterScheduleItemsForExport(workspace.items, filters.status);
  const currency = workspace.budgetCurrency;
  const customFrom = parseScheduleExportIsoDate(filters.from);
  const customTo = parseScheduleExportIsoDate(filters.to);
  const hasCustomRange = Boolean(customFrom || customTo);
  const view = parseScheduleExportView(filters.view);

  const autoRange = computeExportDateRange(items, hasCustomRange ? 0 : 7);
  const range = resolveExportGanttRange(autoRange, customFrom, customTo);
  const scopedItems =
    hasCustomRange && range
      ? keepScheduleItemsOverlappingRange(items, range.startIso, range.endIso)
      : items;
  const rows = scopedItems.map((item) => mapRow(item, currency));

  const filterLine = buildScheduleExportFilterLine({
    budgetName: workspace.budgetName,
    status: filters.status,
    delayedOnly: filters.delayedOnly,
    itemType: filters.itemType,
    view,
    fromIso: hasCustomRange ? range?.startIso : undefined,
    toIso: hasCustomRange ? range?.endIso : undefined,
  });
  const org = await resolveOrgMeta(projectId, ctx);
  const generatedAtIso = new Date().toISOString();
  const todayIso = toIsoDateInTimeZone();
  const scale = range ? chooseGanttScale(range.startIso, range.endIso) : "monthly";
  const gantt: ScheduleExportGantt | null =
    range && view !== "table"
      ? {
          rangeStartIso: range.startIso,
          rangeEndIso: range.endIso,
          todayIso,
          todayLeft: todayMarkerFraction(range.startIso, range.endIso, todayIso),
          axisTicks: buildGanttAxisTicks(range.startIso, range.endIso),
          scale,
          periods: buildGanttPeriods(range.startIso, range.endIso, scale),
        }
      : null;

  const delayedCount = rows.filter((r) => r.alerts.startsWith("Atrasado")).length;
  const summaryBits = [
    `${rows.length} ítem${rows.length === 1 ? "" : "s"}`,
    !hasCustomRange && workspace.summary.scheduleProgressPct
      ? `Avance ponderado ${formatScheduleExportPct(workspace.summary.scheduleProgressPct)}`
      : null,
    delayedCount > 0 ? `${delayedCount} atrasado${delayedCount === 1 ? "" : "s"}` : null,
  ].filter(Boolean);

  return {
    projectId,
    budgetName: workspace.budgetName,
    budgetCurrency: currency,
    filterLine,
    view,
    orgLine: org.orgLine,
    projectLabel: org.projectLabel,
    generatedAtIso,
    summaryLine: summaryBits.join(" · "),
    rows,
    gantt,
  };
}

export async function exportScheduleXlsx(
  projectId: string,
  filters: ScheduleExportFilters,
  ctx: ServiceContext,
): Promise<ReportXlsxPayload> {
  const payload = await buildScheduleExportPayload(projectId, filters, ctx);
  const buffer = buildStyledScheduleXlsx(payload);
  const slug = payload.budgetName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 60);
  const viewSuffix = payload.view === "both" ? "" : `_${payload.view}`;
  return {
    buffer,
    filename: safeReportFilename(`cronograma_${slug}${viewSuffix}`, "xlsx"),
  };
}
