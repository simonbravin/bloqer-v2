import type { Prisma, ScheduleItemStatus } from "@bloqer/database";
import { prisma } from "@bloqer/database";
import { log, listEntityAuditLogs } from "../audit/audit.service";
import { requireProjectAccess } from "../security/access";
import type { ServiceContext } from "../types";
import { ServiceError } from "../types";
import { canViewScheduleArea } from "./schedule-access";
import { formatDateOnly } from "./schedule-helpers";
import { serializeProgressPct } from "./schedule-progress-sync-pure";

export const SCHEDULE_ITEM_ENTITY = "ScheduleItem";
export const SCHEDULE_ENTITY = "Schedule";

export const SCHEDULE_AUDIT_ACTIONS = [
  "schedule.created",
  "schedule.imported_from_budget",
  "schedule.containers_rollup",
  "schedule_item.created",
  "schedule_item.name_updated",
  "schedule_item.dates_updated",
  "schedule_item.progress_updated",
  "schedule_item.moved",
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
  tx?: Prisma.TransactionClient,
) {
  await log(
    {
      tenantId: ctx.tenantId,
      actorUserId: ctx.actorUserId,
      action,
      entityType,
      entityId,
      before,
      after,
      ipAddress: ctx.ipAddress ?? null,
    },
    tx,
  );
}

export function scheduleItemSnapshot(item: {
  name: string;
  status: ScheduleItemStatus;
  startDate: Date | null;
  endDate: Date | null;
  progressPct: { toString: () => string };
  blockReason: string | null;
}) {
  return {
    name: item.name,
    status: item.status,
    startDate: formatDateOnly(item.startDate),
    endDate: formatDateOnly(item.endDate),
    progressPct: serializeProgressPct(item.progressPct.toString()),
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
  "schedule_item.progress_updated": "Avance real actualizado",
  "schedule_item.moved": "Ítem reordenado",
  "schedule_item.status_changed": "Estado cambiado",
  "schedule_item.started": "Tarea iniciada",
  "schedule_item.completed": "Tarea completada",
  "schedule_item.blocked": "Tarea bloqueada",
  "schedule_item.unblocked": "Tarea desbloqueada",
  "schedule_item.cancelled": "Tarea anulada",
  "schedule_item.created": "Tarea creada",
  "schedule_item.name_updated": "Nombre actualizado",
  "schedule_item.wbs_linked": "EDT vinculado",
  "schedule_item.wbs_unlinked": "EDT desvinculado",
  "schedule_dependency.added": "Dependencia agregada",
  "schedule_dependency.removed": "Dependencia eliminada",
  "schedule.imported_from_budget": "Importación desde presupuesto",
  "schedule.containers_rollup": "Fechas de contenedores recalculadas",
};

/** UI gloss for ScheduleItemStatus — enums stay English in snapshots. */
const STATUS_LABEL_ES: Record<string, string> = {
  PLANNED: "Planificado",
  IN_PROGRESS: "En curso",
  BLOCKED: "Bloqueado",
  COMPLETED: "Completado",
  CANCELLED: "Anulado",
};

function statusLabelEs(status: string): string {
  return STATUS_LABEL_ES[status] ?? status;
}

function summarizeEntry(action: string, after: unknown, before: unknown): string {
  const label = ACTION_LABELS[action] ?? action;
  if (action === "schedule_item.blocked" && after && typeof after === "object") {
    const reason = (after as { blockReason?: string }).blockReason;
    if (reason) return `${label}: ${reason}`;
  }
  if (
    action === "schedule_item.progress_updated" &&
    before &&
    after &&
    typeof before === "object" &&
    typeof after === "object"
  ) {
    const fromPct = (before as { progressPct?: string }).progressPct;
    const toPct = (after as { progressPct?: string }).progressPct;
    const fromStatus = (before as { status?: string }).status;
    const toStatus = (after as { status?: string }).status;
    const parts: string[] = [];
    if (fromPct != null && toPct != null && fromPct !== toPct) {
      parts.push(`${fromPct}% → ${toPct}%`);
    } else if (toPct != null) {
      parts.push(`${toPct}%`);
    }
    if (fromStatus && toStatus && fromStatus !== toStatus) {
      parts.push(`${statusLabelEs(fromStatus)} → ${statusLabelEs(toStatus)}`);
    }
    if (parts.length > 0) return `${label}: ${parts.join(" · ")}`;
  }
  if (
    (action === "schedule_item.status_changed" ||
      action === "schedule_item.started" ||
      action === "schedule_item.completed" ||
      action === "schedule_item.unblocked" ||
      action === "schedule_item.cancelled") &&
    before &&
    after &&
    typeof before === "object" &&
    typeof after === "object"
  ) {
    const from = (before as { status?: string }).status;
    const to = (after as { status?: string }).status;
    if (from && to && from !== to) {
      return `${label}: ${statusLabelEs(from)} → ${statusLabelEs(to)}`;
    }
  }
  return label;
}

export async function listScheduleItemAuditHistory(
  scheduleItemId: string,
  ctx: ServiceContext,
): Promise<ScheduleItemAuditEntryDto[]> {
  if (!canViewScheduleArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos");
  }

  const item = await prisma.scheduleItem.findFirst({
    where: { id: scheduleItemId, tenantId: ctx.tenantId },
    select: { id: true, schedule: { select: { projectId: true } } },
  });
  if (!item) throw new ServiceError("NOT_FOUND", "Ítem no encontrado");
  await requireProjectAccess(item.schedule.projectId, ctx);

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
