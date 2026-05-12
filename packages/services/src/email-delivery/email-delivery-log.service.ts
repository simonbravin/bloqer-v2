import type {
  EmailDeliveryLog,
  EmailDeliveryStatus,
  EmailDeliveryType,
  EmailProvider,
  LinkedEntityType,
} from "@bloqer/database";
import { prisma, type Prisma } from "@bloqer/database";
import { canRunOperationalAlerts } from "../notifications/operational-alerts-runner.service";
import { ServiceContext, ServiceError } from "../types";

const ERROR_MESSAGE_MAX = 512;
const SKIP_REASON_MAX = 256;
const SUBJECT_MAX = 998;

const METADATA_BLOCKED_KEY = /secret|password|token|apikey|storagekey|authorization/i;

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

/** Strip keys that could carry secrets; keep values shallow and bounded. */
export function sanitizeEmailDeliveryMetadata(meta: unknown): Record<string, string | number | boolean | null> | undefined {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return undefined;
  const o = meta as Record<string, unknown>;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(o)) {
    if (METADATA_BLOCKED_KEY.test(k)) continue;
    if (v === null) {
      out[k] = null;
      continue;
    }
    if (typeof v === "boolean" || typeof v === "number") {
      out[k] = v;
      continue;
    }
    if (typeof v === "string") {
      out[k] = truncate(v, 2000);
      continue;
    }
    out[k] = truncate(String(v), 500);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function assertCanListEmailLogs(ctx: ServiceContext): void {
  if (!canRunOperationalAlerts(ctx)) {
    throw new ServiceError("FORBIDDEN", "Solo OWNER o ADMIN pueden ver el historial de emails");
  }
}

async function getLogForMutation(id: string, ctx: ServiceContext): Promise<{ id: string }> {
  const log = await prisma.emailDeliveryLog.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: { id: true },
  });
  if (!log) {
    throw new ServiceError("NOT_FOUND", "Registro de envío no encontrado");
  }
  return log;
}

export type CreateEmailDeliveryLogInput = {
  recipientEmail: string;
  subject: string;
  emailType: EmailDeliveryType;
  /** Defaults to PENDING. */
  status?: EmailDeliveryStatus;
  /** Defaults to DISABLED when status is PENDING or SKIPPED; use explicit value for terminal SENT on create (rare). */
  provider?: EmailProvider;
  recipientUserId?: string | null;
  /** Overrides ctx.companyId when set (e.g. notification row). */
  companyId?: string | null;
  relatedEntityType?: LinkedEntityType | null;
  relatedEntityId?: string | null;
  reportType?: string | null;
  reportFormat?: string | null;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown> | null;
  skippedReason?: string | null;
  errorMessage?: string | null;
  providerMessageId?: string | null;
  sentAt?: Date | null;
};

export async function createEmailDeliveryLog(
  input: CreateEmailDeliveryLogInput,
  ctx: ServiceContext,
): Promise<{ id: string }> {
  const status: EmailDeliveryStatus = input.status ?? "PENDING";
  const provider =
    input.provider ??
    (status === "SENT" ? "RESEND" : "DISABLED");

  const row = await prisma.emailDeliveryLog.create({
    data: {
      tenantId: ctx.tenantId,
      companyId: input.companyId !== undefined ? input.companyId : ctx.companyId,
      recipientUserId: input.recipientUserId ?? null,
      recipientEmail: truncate(input.recipientEmail.trim(), 320),
      subject: truncate(input.subject, SUBJECT_MAX),
      emailType: input.emailType,
      status,
      provider,
      providerMessageId: input.providerMessageId ?? null,
      skippedReason: input.skippedReason ? truncate(input.skippedReason, SKIP_REASON_MAX) : null,
      errorMessage: input.errorMessage ? truncate(input.errorMessage, ERROR_MESSAGE_MAX) : null,
      relatedEntityType: input.relatedEntityType ?? undefined,
      relatedEntityId: input.relatedEntityId ?? null,
      reportType: input.reportType ? truncate(input.reportType, 64) : null,
      reportFormat: input.reportFormat ? truncate(input.reportFormat, 16) : null,
      idempotencyKey: input.idempotencyKey ? truncate(input.idempotencyKey, 512) : null,
      metadata: sanitizeEmailDeliveryMetadata(input.metadata ?? undefined) ?? undefined,
      sentAt: input.sentAt ?? null,
    },
    select: { id: true },
  });
  return { id: row.id };
}

export async function markEmailDeliverySent(
  id: string,
  providerMessageId: string | undefined,
  ctx: ServiceContext,
): Promise<void> {
  await getLogForMutation(id, ctx);
  await prisma.emailDeliveryLog.update({
    where: { id },
    data: {
      status: "SENT",
      provider: "RESEND",
      providerMessageId: providerMessageId ? truncate(providerMessageId, 256) : null,
      sentAt: new Date(),
      skippedReason: null,
      errorMessage: null,
    },
  });
}

export async function markEmailDeliverySkipped(
  id: string,
  skippedReason: string,
  ctx: ServiceContext,
): Promise<void> {
  await getLogForMutation(id, ctx);
  await prisma.emailDeliveryLog.update({
    where: { id },
    data: {
      status: "SKIPPED",
      provider: "DISABLED",
      skippedReason: truncate(skippedReason, SKIP_REASON_MAX),
      errorMessage: null,
    },
  });
}

export async function markEmailDeliveryFailed(
  id: string,
  errorMessage: string,
  ctx: ServiceContext,
  provider: EmailProvider = "RESEND",
): Promise<void> {
  await getLogForMutation(id, ctx);
  await prisma.emailDeliveryLog.update({
    where: { id },
    data: {
      status: "FAILED",
      provider,
      errorMessage: truncate(errorMessage, ERROR_MESSAGE_MAX),
      skippedReason: null,
    },
  });
}

export async function getEmailDeliveryLogById(id: string, ctx: ServiceContext): Promise<EmailDeliveryLog> {
  assertCanListEmailLogs(ctx);
  const row = await prisma.emailDeliveryLog.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!row) {
    throw new ServiceError("NOT_FOUND", "Registro de envío no encontrado");
  }
  return row;
}

export type ListEmailDeliveryLogsFilters = {
  status?: EmailDeliveryStatus;
  emailType?: EmailDeliveryType;
  recipientEmail?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
};

export type EmailDeliveryLogListItem = Pick<
  EmailDeliveryLog,
  | "id"
  | "createdAt"
  | "recipientEmail"
  | "emailType"
  | "status"
  | "provider"
  | "subject"
  | "skippedReason"
  | "errorMessage"
  | "providerMessageId"
  | "reportType"
  | "reportFormat"
>;

export async function listEmailDeliveryLogs(
  filters: ListEmailDeliveryLogsFilters,
  ctx: ServiceContext,
): Promise<EmailDeliveryLogListItem[]> {
  assertCanListEmailLogs(ctx);
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);

  const where: Prisma.EmailDeliveryLogWhereInput = {
    tenantId: ctx.tenantId,
  };
  if (filters.status) where.status = filters.status;
  if (filters.emailType) where.emailType = filters.emailType;
  if (filters.recipientEmail?.trim()) {
    where.recipientEmail = { contains: filters.recipientEmail.trim(), mode: "insensitive" };
  }
  if (filters.dateFrom || filters.dateTo) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (filters.dateFrom) {
      const d = new Date(filters.dateFrom);
      if (!Number.isNaN(d.getTime())) createdAt.gte = d;
    }
    if (filters.dateTo) {
      const d = new Date(filters.dateTo);
      if (!Number.isNaN(d.getTime())) {
        d.setHours(23, 59, 59, 999);
        createdAt.lte = d;
      }
    }
    if (Object.keys(createdAt).length > 0) {
      where.createdAt = createdAt;
    }
  }

  return prisma.emailDeliveryLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      createdAt: true,
      recipientEmail: true,
      emailType: true,
      status: true,
      provider: true,
      subject: true,
      skippedReason: true,
      errorMessage: true,
      providerMessageId: true,
      reportType: true,
      reportFormat: true,
    },
  });
}
