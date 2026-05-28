import type { Prisma, ScheduleItemStatus } from "@bloqer/database";
import { log, listEntityAuditLogs } from "../audit/audit.service";
import type { ServiceContext } from "../types";
import { formatDateOnly } from "./schedule-helpers";

export const SCHEDULE_ITEM_ENTITY = "ScheduleItem";
export const SCHEDULE_ENTITY = "Schedule";

export const SCHEDULE_AUDIT_ACTIONS = [
  "schedule.created",
  "schedule.imported_from_budget",
  "schedule_item.created",
  "schedule_item.name_updated",
  "schedule_item.dates_updated",
  "schedule_item.progress_updated",
  "schedule_item.status_changed",
  "schedule_item.started",
  "schedule_item.completed",
  "schedule_item.blocked",
  "schedule_item.unblocked",
  "schedule_item.cancelled",
  "schedule_item.wbs_linked",
  "schedule_item.wbs_unlinked",
  "schedule_dependency.added",
  "schedule_dependency.removed",
] as const;

export type ScheduleAuditAction = (typeof SCHEDULE_AUDIT_ACTIONS)[number];

export function statusChangeAuditAction(
  from: ScheduleItemStatus,
  to: ScheduleItemStatus,
): ScheduleAuditAction {
  if (to === "IN_PROGRESS" && from === "PLANNED") return "schedule_item.started";
  if (to === "IN_PROGRESS" && from === "BLOCKED") return "schedule_item.unblocked";
  if (to === "COMPLETED") return "schedule_item.completed";
  if (to === "BLOCKED") return "schedule_item.blocked";
  if (to === "CANCELLED") return "schedule_item.cancelled";
  return "schedule_item.status_changed";
}

export async function auditSchedule(
  ctx: ServiceContext,
  action: ScheduleAuditAction,
  entityType: string,
  entityId: string,
  before?: Prisma.InputJsonValue,
  after?: Prisma.InputJsonValue,
) {
  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action,
    entityType,
    entityId,
    before,
    after,
    ipAddress: ctx.ipAddress ?? null,
  });
}

export function scheduleItemSnapshot(item: {
  name: string;
  status: ScheduleItemStatus;
  startDate: Date | null;
  endDate: Date | null;
  progressPct: { toFixed: (n: number) => string };
  blockReason: string | null;
}) {
  return {
    name: item.name,
    status: item.status,
    startDate: formatDateOnly(item.startDate),
    endDate: formatDateOnly(item.endDate),
    progressPct: item.progressPct.toFixed(2),
    blockReason: item.blockReason,
  };
}

export type ScheduleItemAuditEntryDto = {
  id: string;
  action: string;
  actorName: string | null;
  createdAt: Date;
  summary: string;
};

const ACTION_LABELS: Record<string, string> = {
  "schedule_item.dates_updated": "Fechas actualizadas",
  "schedule_item.progress_updated": "Avance planificado actualizado",
  "schedule_item.status_changed": "Estado cambiado",
  "schedule_item.started": "Tarea iniciada",
  "schedule_item.completed": "Tarea completada",
  "schedule_item.blocked": "Tarea bloqueada",
  "schedule_item.unblocked": "Tarea desbloqueada",
  "schedule_item.cancelled": "Tarea cancelada",
  "schedule_item.created": "Tarea creada",
  "schedule_item.name_updated": "Nombre actualizado",
  "schedule_item.wbs_linked": "WBS vinculado",
  "schedule_item.wbs_unlinked": "WBS desvinculado",
  "schedule_dependency.added": "Dependencia agregada",
  "schedule_dependency.removed": "Dependencia eliminada",
  "schedule.imported_from_budget": "Importación desde presupuesto",
};

function summarizeEntry(action: string, after: unknown, before: unknown): string {
  const label = ACTION_LABELS[action] ?? action;
  if (action === "schedule_item.blocked" && after && typeof after === "object") {
    const reason = (after as { blockReason?: string }).blockReason;
    if (reason) return `${label}: ${reason}`;
  }
  if (action === "schedule_item.status_changed" && before && after && typeof before === "object" && typeof after === "object") {
    const from = (before as { status?: string }).status;
    const to = (after as { status?: string }).status;
    if (from && to) return `${label}: ${from} → ${to}`;
  }
  return label;
}

export async function listScheduleItemAuditHistory(
  scheduleItemId: string,
  ctx: ServiceContext,
): Promise<ScheduleItemAuditEntryDto[]> {
  const rows = await listEntityAuditLogs(
    ctx.tenantId,
    SCHEDULE_ITEM_ENTITY,
    scheduleItemId,
    [...SCHEDULE_AUDIT_ACTIONS],
  );
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    actorName: r.actor?.name ?? r.actor?.email ?? null,
    createdAt: r.createdAt,
    summary: summarizeEntry(r.action, r.after, r.before),
  }));
}
