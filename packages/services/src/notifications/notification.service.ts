import type { LinkedEntityType, NotificationSeverity, NotificationStatus, NotificationType, Prisma } from "@bloqer/database";
import { prisma } from "@bloqer/database";
import { isUuid } from "@bloqer/utils";
import { ServiceContext, ServiceError } from "../types";

export type NotificationInboxFilter = "all" | "unread" | "read" | "archived";

export type CreateNotificationInput = {
  recipientUserId: string;
  companyId?: string | null;
  type: NotificationType;
  title: string;
  body: string;
  severity?: NotificationSeverity;
  linkedEntityType?: LinkedEntityType | null;
  linkedEntityId?: string | null;
  projectId?: string | null;
  actionUrl?: string | null;
  metadata?: Prisma.JsonObject | null;
};

export type CreateSystemNotificationInput = CreateNotificationInput & {
  tenantId: string;
};

export type NotificationListItem = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  severity: NotificationSeverity;
  status: NotificationStatus;
  linkedEntityType: LinkedEntityType | null;
  linkedEntityId: string | null;
  projectId: string | null;
  actionUrl: string | null;
  createdAt: string;
  readAt: string | null;
  archivedAt: string | null;
};

async function assertRecipientInTenant(recipientUserId: string, tenantId: string): Promise<void> {
  const m = await prisma.userMembership.findFirst({
    where: { userId: recipientUserId, tenantId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!m) {
    throw new ServiceError("FORBIDDEN", "El destinatario no pertenece al tenant o no tiene membresía activa");
  }
}

/** In-app links only: same-origin path, no protocol-relative or scheme URLs. */
function normalizeActionUrl(actionUrl: string | null | undefined): string | null {
  if (actionUrl === undefined || actionUrl === null || actionUrl.trim() === "") return null;
  const u = actionUrl.trim();
  if (!u.startsWith("/") || u.startsWith("//")) {
    throw new ServiceError("VALIDATION", "actionUrl debe ser una ruta relativa que empiece con /");
  }
  return u;
}

async function assertProjectInTenant(projectId: string | null | undefined, tenantId: string): Promise<void> {
  if (!projectId) return;
  const p = await prisma.project.findFirst({
    where: { id: projectId, tenantId },
    select: { id: true },
  });
  if (!p) {
    throw new ServiceError("VALIDATION", "projectId no pertenece al tenant");
  }
}

function inboxStatusFilter(filter: NotificationInboxFilter): Pick<Prisma.NotificationWhereInput, "status"> {
  switch (filter) {
    case "unread":
      return { status: "UNREAD" };
    case "read":
      return { status: "READ" };
    case "archived":
      return { status: "ARCHIVED" };
    case "all":
    default:
      // Default inbox: active items only. Archived has its own filter.
      return { status: { in: ["UNREAD", "READ"] } };
  }
}

/**
 * Called from route handlers / actions with a full `ServiceContext`.
 * Only allows creating a notification for the current user (inbox self-test / future use).
 */
export async function createNotification(input: CreateNotificationInput, ctx: ServiceContext): Promise<{ id: string }> {
  if (input.recipientUserId !== ctx.actorUserId) {
    throw new ServiceError("FORBIDDEN", "Solo podés crear notificaciones para tu usuario");
  }
  return createSystemNotification({
    tenantId: ctx.tenantId,
    companyId: input.companyId ?? ctx.companyId,
    recipientUserId: input.recipientUserId,
    type: input.type,
    title: input.title,
    body: input.body,
    severity: input.severity,
    linkedEntityType: input.linkedEntityType,
    linkedEntityId: input.linkedEntityId,
    projectId: input.projectId,
    actionUrl: input.actionUrl,
    metadata: input.metadata,
  });
}

/**
 * Server-only: other services call this with an explicit tenant and a validated recipient.
 */
export async function createSystemNotification(input: CreateSystemNotificationInput): Promise<{ id: string }> {
  const { tenantId, recipientUserId, companyId, type, title, body, severity, linkedEntityType, linkedEntityId, projectId, actionUrl, metadata } =
    input;

  if (!recipientUserId?.trim()) {
    throw new ServiceError("VALIDATION", "recipientUserId es obligatorio");
  }

  await assertRecipientInTenant(recipientUserId, tenantId);
  await assertProjectInTenant(projectId ?? null, tenantId);
  const safeActionUrl = normalizeActionUrl(actionUrl);

  const row = await prisma.notification.create({
    data: {
      tenantId,
      companyId: companyId ?? null,
      recipientUserId,
      type,
      title,
      body,
      severity: severity ?? "INFO",
      status: "UNREAD",
      linkedEntityType: linkedEntityType ?? null,
      linkedEntityId: linkedEntityId ?? null,
      projectId: projectId ?? null,
      actionUrl: safeActionUrl,
      metadata:
        metadata === undefined || metadata === null
          ? undefined
          : (metadata as Prisma.InputJsonValue),
    },
    select: { id: true },
  });

  return { id: row.id };
}

export const NOTIFICATION_BELL_LIMIT = 5;
export const NOTIFICATION_INBOX_PAGE_SIZE = 20;
const NOTIFICATION_INBOX_MAX_PAGE_SIZE = 50;

export type ListMyNotificationsResult = {
  items: NotificationListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export async function listMyNotifications(
  filter: NotificationInboxFilter,
  ctx: ServiceContext,
  options?: { page?: number; pageSize?: number },
): Promise<ListMyNotificationsResult> {
  const rawPage = options?.page ?? 1;
  const requestedPage =
    typeof rawPage === "number" && Number.isFinite(rawPage) && rawPage >= 1
      ? Math.floor(rawPage)
      : 1;
  const rawSize = options?.pageSize ?? NOTIFICATION_INBOX_PAGE_SIZE;
  const pageSize = Math.min(
    NOTIFICATION_INBOX_MAX_PAGE_SIZE,
    Math.max(
      1,
      typeof rawSize === "number" && Number.isFinite(rawSize) ? Math.floor(rawSize) : NOTIFICATION_INBOX_PAGE_SIZE,
    ),
  );
  const where = {
    tenantId: ctx.tenantId,
    recipientUserId: ctx.actorUserId,
    ...inboxStatusFilter(filter),
  };

  const total = await prisma.notification.count({ where });
  const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);
  const page = Math.min(requestedPage, totalPages);

  const rows = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  return {
    items: rows.map(serializeRow),
    total,
    page,
    pageSize,
  };
}

export async function getUnreadNotificationCount(ctx: ServiceContext): Promise<number> {
  return prisma.notification.count({
    where: {
      tenantId: ctx.tenantId,
      recipientUserId: ctx.actorUserId,
      status: "UNREAD",
    },
  });
}

export type NotificationBellSnapshot = {
  unreadCount: number;
  items: NotificationListItem[];
};

/**
 * Header bell: unread badge + last N non-archived notifications (read or unread).
 */
export async function getNotificationBellSnapshot(ctx: ServiceContext): Promise<NotificationBellSnapshot> {
  const [unreadCount, rows] = await Promise.all([
    getUnreadNotificationCount(ctx),
    prisma.notification.findMany({
      where: {
        tenantId: ctx.tenantId,
        recipientUserId: ctx.actorUserId,
        status: { in: ["UNREAD", "READ"] },
      },
      orderBy: { createdAt: "desc" },
      take: NOTIFICATION_BELL_LIMIT,
    }),
  ]);

  return { unreadCount, items: rows.map(serializeRow) };
}

function assertOwnNotificationId(notificationId: string): void {
  if (!isUuid(notificationId)) {
    throw new ServiceError("NOT_FOUND", "Notificación no encontrada o ya procesada");
  }
}

export async function markNotificationAsRead(notificationId: string, ctx: ServiceContext): Promise<void> {
  assertOwnNotificationId(notificationId);
  const res = await prisma.notification.updateMany({
    where: {
      id: notificationId,
      tenantId: ctx.tenantId,
      recipientUserId: ctx.actorUserId,
      status: "UNREAD",
    },
    data: { status: "READ", readAt: new Date() },
  });
  if (res.count === 0) {
    throw new ServiceError("NOT_FOUND", "Notificación no encontrada o ya procesada");
  }
}

export async function markNotificationAsUnread(notificationId: string, ctx: ServiceContext): Promise<void> {
  assertOwnNotificationId(notificationId);
  const res = await prisma.notification.updateMany({
    where: {
      id: notificationId,
      tenantId: ctx.tenantId,
      recipientUserId: ctx.actorUserId,
      status: "READ",
    },
    data: { status: "UNREAD", readAt: null },
  });
  if (res.count === 0) {
    throw new ServiceError("NOT_FOUND", "Notificación no encontrada o ya procesada");
  }
}

export async function markAllNotificationsAsRead(ctx: ServiceContext): Promise<void> {
  await prisma.notification.updateMany({
    where: {
      tenantId: ctx.tenantId,
      recipientUserId: ctx.actorUserId,
      status: "UNREAD",
    },
    data: { status: "READ", readAt: new Date() },
  });
}

export async function archiveNotification(notificationId: string, ctx: ServiceContext): Promise<void> {
  assertOwnNotificationId(notificationId);
  const res = await prisma.notification.updateMany({
    where: {
      id: notificationId,
      tenantId: ctx.tenantId,
      recipientUserId: ctx.actorUserId,
      status: { in: ["UNREAD", "READ"] },
    },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });
  if (res.count === 0) {
    throw new ServiceError("NOT_FOUND", "Notificación no encontrada o ya archivada");
  }
}

function serializeRow(row: {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  severity: NotificationSeverity;
  status: NotificationStatus;
  linkedEntityType: LinkedEntityType | null;
  linkedEntityId: string | null;
  projectId: string | null;
  actionUrl: string | null;
  createdAt: Date;
  readAt: Date | null;
  archivedAt: Date | null;
}): NotificationListItem {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    severity: row.severity,
    status: row.status,
    linkedEntityType: row.linkedEntityType,
    linkedEntityId: row.linkedEntityId,
    projectId: row.projectId,
    actionUrl: row.actionUrl,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}
