import type { NotificationType } from "@bloqer/database";
import { createSystemNotification } from "../notifications/notification.service";
import { sendNotificationEmailAsSystem } from "../notifications/notification-email.service";
import {
  resolveJobsiteLogSubmittedAudience,
  resolveNotificationAudience,
} from "../notifications/notification-audience.service";
import {
  formatNotificationIdentityBody,
  loadNotificationIdentityFacts,
} from "../notifications/notification-email-context";
import {
  formatJobsiteLogDate,
  formatNotificationTitle,
} from "../notifications/notification-copy";
import type { ServiceContext } from "../types";

type JobsiteLogNotifyBase = {
  ctx: ServiceContext;
  jobsiteLogId: string;
  projectId: string;
  companyId: string;
  logDate: Date;
  createdBy: string | null;
};

async function fanOut(params: {
  ctx: ServiceContext;
  recipients: string[];
  type: NotificationType;
  title: string;
  body: string;
  severity: "INFO" | "WARNING" | "SUCCESS";
  jobsiteLogId: string;
  projectId: string;
  companyId: string;
  actionUrl: string;
  alwaysCcOwnerAdmin?: boolean;
  excludeUserId?: string | null;
}): Promise<void> {
  const unique = await resolveNotificationAudience({
    tenantId: params.ctx.tenantId,
    primaryUserIds: params.recipients,
    excludeUserId: params.excludeUserId,
    alwaysCcOwnerAdmin: params.alwaysCcOwnerAdmin ?? true,
  });

  for (const recipientUserId of unique) {
    try {
      const { id: notificationId } = await createSystemNotification({
        tenantId: params.ctx.tenantId,
        companyId: params.companyId,
        recipientUserId,
        type: params.type,
        title: params.title,
        body: params.body,
        severity: params.severity,
        linkedEntityType: "JOBSITE_LOG",
        linkedEntityId: params.jobsiteLogId,
        projectId: params.projectId,
        actionUrl: params.actionUrl,
        metadata: { jobsiteLogId: params.jobsiteLogId },
      });
      await sendNotificationEmailAsSystem(notificationId, params.ctx).catch(() => undefined);
    } catch {
      /* best-effort — never abort jobsite-log lifecycle */
    }
  }
}

function detailUrl(projectId: string, jobsiteLogId: string): string {
  return `/proyectos/${projectId}/libro-obra/${jobsiteLogId}`;
}

function editUrl(projectId: string, jobsiteLogId: string): string {
  return `/proyectos/${projectId}/libro-obra/${jobsiteLogId}/editar`;
}

/** After DRAFT → SUBMITTED ([D-091]). Audience = roster ∩ canSupervise ∪ OWNER/ADMIN. */
export async function notifyJobsiteLogSubmitted(params: JobsiteLogNotifyBase): Promise<void> {
  const dateLabel = formatJobsiteLogDate(params.logDate);
  const recipients = await resolveJobsiteLogSubmittedAudience({
    tenantId: params.ctx.tenantId,
    projectId: params.projectId,
    excludeUserId: params.ctx.actorUserId,
  });

  const facts = await loadNotificationIdentityFacts({
    tenantId: params.ctx.tenantId,
    companyId: params.companyId,
    projectId: params.projectId,
    requestedByUserId: params.createdBy,
    actorUserId: params.ctx.actorUserId,
  });

  await fanOut({
    ctx: params.ctx,
    recipients,
    type: "JOBSITE_LOG_SUBMITTED",
    title: formatNotificationTitle("Parte pendiente", dateLabel),
    body: formatNotificationIdentityBody(
      "Hay un parte de obra pendiente de aprobación.",
      facts,
    ),
    severity: "INFO",
    jobsiteLogId: params.jobsiteLogId,
    projectId: params.projectId,
    companyId: params.companyId,
    actionUrl: detailUrl(params.projectId, params.jobsiteLogId),
    excludeUserId: params.ctx.actorUserId,
    alwaysCcOwnerAdmin: false,
  });
}

/** After SUBMITTED → DRAFT with return notes ([D-091] + email). */
export async function notifyJobsiteLogReturned(
  params: JobsiteLogNotifyBase & { returnNotes: string | null | undefined },
): Promise<void> {
  const dateLabel = formatJobsiteLogDate(params.logDate);
  const notes = params.returnNotes?.trim();
  const lead = notes
    ? `Motivo: ${notes.length > 500 ? `${notes.slice(0, 500)}…` : notes}`
    : "Un supervisor devolvió el parte a borrador.";

  const facts = await loadNotificationIdentityFacts({
    tenantId: params.ctx.tenantId,
    companyId: params.companyId,
    projectId: params.projectId,
    requestedByUserId: params.createdBy,
    actorUserId: params.ctx.actorUserId,
  });

  await fanOut({
    ctx: params.ctx,
    recipients: params.createdBy ? [params.createdBy] : [],
    type: "JOBSITE_LOG_RETURNED",
    title: formatNotificationTitle("Parte devuelto", dateLabel),
    body: formatNotificationIdentityBody(lead, facts),
    severity: "WARNING",
    jobsiteLogId: params.jobsiteLogId,
    projectId: params.projectId,
    companyId: params.companyId,
    actionUrl: editUrl(params.projectId, params.jobsiteLogId),
    excludeUserId: params.ctx.actorUserId,
    alwaysCcOwnerAdmin: true,
  });
}

/** After SUBMITTED → APPROVED ([D-091]). */
export async function notifyJobsiteLogApproved(params: JobsiteLogNotifyBase): Promise<void> {
  const dateLabel = formatJobsiteLogDate(params.logDate);
  const facts = await loadNotificationIdentityFacts({
    tenantId: params.ctx.tenantId,
    companyId: params.companyId,
    projectId: params.projectId,
    requestedByUserId: params.createdBy,
    actorUserId: params.ctx.actorUserId,
  });

  await fanOut({
    ctx: params.ctx,
    recipients: params.createdBy ? [params.createdBy] : [],
    type: "JOBSITE_LOG_APPROVED",
    title: formatNotificationTitle("Parte aprobado", dateLabel),
    body: formatNotificationIdentityBody("El parte de obra fue aprobado.", facts),
    severity: "SUCCESS",
    jobsiteLogId: params.jobsiteLogId,
    projectId: params.projectId,
    companyId: params.companyId,
    actionUrl: detailUrl(params.projectId, params.jobsiteLogId),
    excludeUserId: params.ctx.actorUserId,
    alwaysCcOwnerAdmin: true,
  });
}
