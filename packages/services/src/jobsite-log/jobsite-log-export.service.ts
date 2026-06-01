import type { JobsiteLogIssueSeverity, JobsiteLogIssueStatus, JobsiteLogIssueType, JobsiteLogStatus } from "@bloqer/database";
import { formatDateLong, formatDateTime, toIsoDateLocal } from "@bloqer/utils";
import { listEntityDocuments } from "../documents/document.service";
import { getProjectShellInfo } from "../project/project.service";
import type { ServiceContext } from "../types";
import { ServiceError } from "../types";
import {
  getJobsiteLogActivityLog,
  getJobsiteLogById,
  type JobsiteLogLifecycleLogEntry,
} from "./jobsite-log.service";

const STATUS_LABELS: Record<JobsiteLogStatus, string> = {
  DRAFT: "Borrador",
  SUBMITTED: "Enviado",
  APPROVED: "Aprobado",
  CANCELLED: "Anulado",
};

const ISSUE_TYPE_LABELS: Record<JobsiteLogIssueType, string> = {
  INCIDENT: "Incidente",
  BLOCKER: "Bloqueo",
  SAFETY: "Seguridad",
  OTHER: "Otro",
};

const ISSUE_SEVERITY_LABELS: Record<JobsiteLogIssueSeverity, string> = {
  LOW: "Baja",
  MEDIUM: "Media",
  HIGH: "Alta",
  CRITICAL: "Crítica",
};

const ISSUE_STATUS_LABELS: Record<JobsiteLogIssueStatus, string> = {
  OPEN: "Abierto",
  RESOLVED: "Resuelto",
  ESCALATED: "Escalado",
};

const LIFECYCLE_ACTION_LABELS: Record<string, string> = {
  JOBSITE_LOG_CREATED: "Parte creado",
  JOBSITE_LOG_UPDATED: "Parte actualizado",
  JOBSITE_LOG_SUBMITTED: "Enviado a revisión",
  JOBSITE_LOG_APPROVED: "Aprobado",
  JOBSITE_LOG_RETURNED: "Devuelto con observaciones",
  JOBSITE_LOG_CANCELLED: "Anulado",
  "document.created": "Documento adjuntado",
  "document.uploaded": "Documento cargado",
  "document.deleted": "Documento eliminado",
};

function formatQty(value: string, unit?: string): string {
  const n = parseFloat(value);
  const formatted = Number.isFinite(n)
    ? n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })
    : value;
  return unit ? `${formatted} ${unit}` : formatted;
}

function lifecycleEntryLabel(entry: JobsiteLogLifecycleLogEntry): string {
  const base = LIFECYCLE_ACTION_LABELS[entry.action] ?? entry.action;
  const statusPart =
    entry.fromStatus && entry.toStatus
      ? ` (${STATUS_LABELS[entry.fromStatus as JobsiteLogStatus] ?? entry.fromStatus} → ${STATUS_LABELS[entry.toStatus as JobsiteLogStatus] ?? entry.toStatus})`
      : "";
  return `${base}${statusPart}`;
}

const MAX_LIFECYCLE_HISTORY_ENTRIES = 40;

/** Activity entries are sorted newest-first; `.find` returns the latest matching event. */
function findLatestLifecycleActor(
  entries: JobsiteLogLifecycleLogEntry[],
  action: string,
): { name: string | null; at: Date | null } {
  const hit = entries.find((e) => e.action === action);
  return {
    name: hit?.actorName ?? null,
    at: hit?.createdAt ?? null,
  };
}

function resolveApprovedTrace(
  status: JobsiteLogStatus,
  updatedAt: Date,
  activity: { updatedByName: string | null },
  approved: { name: string | null; at: Date | null },
): { name: string | null; atLabel: string | null } {
  if (approved.name && approved.at) {
    return { name: approved.name, atLabel: formatDateTime(approved.at) };
  }
  if (status === "APPROVED") {
    return {
      name: approved.name ?? activity.updatedByName ?? "—",
      atLabel: approved.at ? formatDateTime(approved.at) : formatDateTime(updatedAt),
    };
  }
  return { name: null, atLabel: null };
}

export type JobsiteLogPdfRow = Record<string, string>;

export type JobsiteLogPdfPayload = {
  meta: {
    projectCode: string;
    projectName: string;
    logDateIso: string;
    logDateLabel: string;
    title: string | null;
    workFront: string | null;
    shift: string | null;
    weather: string | null;
    status: JobsiteLogStatus;
    statusLabel: string;
    createdByLabel: string;
    createdAtLabel: string;
    updatedByLabel: string | null;
    updatedAtLabel: string | null;
    approvedByLabel: string | null;
    approvedAtLabel: string | null;
    returnNotes: string | null;
  };
  narrativeFields: Array<{ label: string; value: string }>;
  progress: JobsiteLogPdfRow[];
  labor: JobsiteLogPdfRow[];
  materials: JobsiteLogPdfRow[];
  issues: JobsiteLogPdfRow[];
  lifecycleHistory: Array<{
    at: string;
    action: string;
    actor: string;
    comment: string | null;
    detail: string | null;
  }>;
  attachmentsNote: string | null;
  historyTruncated: boolean;
};

export async function buildJobsiteLogPdfPayload(
  logId: string,
  projectId: string,
  ctx: ServiceContext,
): Promise<JobsiteLogPdfPayload> {
  const [log, activity, project, attachments] = await Promise.all([
    getJobsiteLogById(logId, ctx),
    getJobsiteLogActivityLog(logId, ctx),
    getProjectShellInfo(projectId, ctx),
    listEntityDocuments("JOBSITE_LOG", logId, ctx, { projectId }),
  ]);

  if (log.projectId !== projectId) {
    throw new ServiceError("NOT_FOUND", "Parte de obra no encontrado en este proyecto");
  }

  const approved = findLatestLifecycleActor(activity.entries, "JOBSITE_LOG_APPROVED");
  const approvedTrace = resolveApprovedTrace(log.status, log.updatedAt, activity, approved);
  const wasUpdated =
    log.updatedAt.getTime() - log.createdAt.getTime() > 1000 ||
    activity.updatedByName !== activity.createdByName;

  const activeAttachments = attachments.filter((a) => a.status === "ACTIVE");
  let attachmentsNote: string | null = null;
  if (activeAttachments.length > 0) {
    const names = activeAttachments
      .slice(0, 12)
      .map((a) => a.originalFileName)
      .join(", ");
    const extra =
      activeAttachments.length > 12 ? ` y ${activeAttachments.length - 12} más` : "";
    attachmentsNote =
      `Este parte registra ${activeAttachments.length} archivo(s) adjunto(s) en la plataforma ` +
      `(no incluidos en este PDF): ${names}${extra}. Consultá el detalle en Bloqer para descargarlos.`;
  }

  const narrativeFields = [
    { label: "Notas generales", value: log.generalNotes },
    { label: "Impedimentos", value: log.blockers },
    { label: "Incidentes", value: log.incidents },
    { label: "Observaciones de seguridad", value: log.safetyNotes },
  ].filter((f): f is { label: string; value: string } => Boolean(f.value?.trim()));

  return {
    meta: {
      projectCode: log.projectCode,
      projectName: project.name,
      logDateIso: toIsoDateLocal(log.logDate),
      logDateLabel: formatDateLong(log.logDate),
      title: log.title,
      workFront: log.workFront,
      shift: log.shift,
      weather: log.weather,
      status: log.status,
      statusLabel: STATUS_LABELS[log.status],
      createdByLabel: activity.createdByName ?? "—",
      createdAtLabel: formatDateTime(log.createdAt),
      updatedByLabel: wasUpdated ? activity.updatedByName ?? "—" : null,
      updatedAtLabel: wasUpdated ? formatDateTime(log.updatedAt) : null,
      approvedByLabel: approvedTrace.name,
      approvedAtLabel: approvedTrace.atLabel,
      returnNotes: log.status === "DRAFT" ? log.returnNotes : null,
    },
    narrativeFields,
    progress: log.progress.map((p) => ({
      wbs: `${p.wbsNode.code} — ${p.wbsNode.name}`,
      description: p.description ?? "—",
      quantity: formatQty(p.quantityCompleted, p.wbsNode.unit),
      pct: p.physicalPct ? `${p.physicalPct}%` : "—",
      notes: p.notes ?? "—",
    })),
    labor: log.labor.map((lb) => ({
      contact: lb.contactName ?? lb.subcontractCode ?? "—",
      crew: lb.crewDescription ?? "—",
      workers: String(lb.workersCount),
      hours: lb.hoursWorked ?? "—",
      notes: lb.notes ?? "—",
    })),
    materials: log.materials.map((m) => ({
      description: m.description,
      product: m.productName ?? "—",
      warehouse: m.warehouseName ?? "—",
      quantity: formatQty(m.quantity),
      notes: m.notes ?? "—",
    })),
    issues: log.issues.map((iss) => ({
      type: ISSUE_TYPE_LABELS[iss.type as JobsiteLogIssueType] ?? iss.type,
      severity: ISSUE_SEVERITY_LABELS[iss.severity as JobsiteLogIssueSeverity] ?? iss.severity,
      description: iss.description,
      status: ISSUE_STATUS_LABELS[iss.status as JobsiteLogIssueStatus] ?? iss.status,
      notes: iss.notes ?? "—",
    })),
    lifecycleHistory: activity.entries
      .slice(0, MAX_LIFECYCLE_HISTORY_ENTRIES)
      .reverse()
      .map((entry) => ({
        at: formatDateTime(entry.createdAt),
        action: lifecycleEntryLabel(entry),
        actor: entry.actorName ?? "Sistema",
        comment: entry.comment,
        detail: entry.detail,
      })),
    attachmentsNote,
    historyTruncated: activity.entries.length > MAX_LIFECYCLE_HISTORY_ENTRIES,
  };
}
