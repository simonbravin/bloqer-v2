import { prisma } from "@bloqer/database";
import type {
  MembershipStatus,
  ScheduledReportFormat,
  ScheduledReportFrequency,
  ScheduledReportRunStatus,
  ScheduledReportScope,
  ScheduledReportStatus,
} from "@bloqer/database";
import {
  createScheduledReportSchema,
  updateScheduledReportSchema,
  type CreateScheduledReportInput,
  type ScheduledReportKey,
  type UpdateScheduledReportInput,
} from "@bloqer/validators";
import { ServiceContext, ServiceError } from "../types";
import { assertCanManageScheduledReports } from "./scheduled-report-permissions";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import {
  isReportKeyAllowedForScope,
  listReportKeysForScope,
  SCHEDULED_REPORT_KEY_META,
  type ScheduledReportScopeKind,
} from "./scheduled-report-registry";
import { calculateNextRunAt } from "./scheduling";

export type ScheduledReportListFilters = {
  projectId?: string;
  status?: ScheduledReportStatus;
  includeDeleted?: boolean;
};

export type ScheduledReportListRow = {
  id: string;
  name: string;
  scope: ScheduledReportScope;
  projectId: string | null;
  projectLabel: string | null;
  status: ScheduledReportStatus;
  frequency: ScheduledReportFrequency;
  format: ScheduledReportFormat;
  timeOfDay: string;
  timezone: string;
  nextRunAt: Date;
  lastRunAt: Date | null;
  lastRunStatus: ScheduledReportRunStatus | null;
  itemCount: number;
  recipientCount: number;
};

export type ScheduledReportItemRow = {
  reportKey: ScheduledReportKey;
  sortOrder: number;
};

export type ScheduledReportRecipientRow = {
  recipientUserId: string;
  email: string;
  name: string | null;
};

export type ScheduledReportDetail = ScheduledReportListRow & {
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  params: Record<string, string> | null;
  items: ScheduledReportItemRow[];
  recipients: ScheduledReportRecipientRow[];
  createdAt: Date;
  updatedAt: Date;
};

const ACTIVE_MEMBERSHIP = { status: "ACTIVE" as const };

function mapParams(params: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!params || Object.keys(params).length === 0) return undefined;
  return params;
}

export async function getScheduledReportFormTenantTimezone(ctx: ServiceContext): Promise<string> {
  assertCanManageScheduledReports(ctx);
  return resolveTenantTimezone(ctx.tenantId);
}

export type ScheduledReportRecipientPickerRow = {
  userId: string;
  email: string;
  name: string | null;
  status: MembershipStatus;
};

export async function listTenantMembersForScheduledReports(
  ctx: ServiceContext,
): Promise<ScheduledReportRecipientPickerRow[]> {
  assertCanManageScheduledReports(ctx);
  const rows = await prisma.userMembership.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { createdAt: "asc" },
    select: {
      status: true,
      user: { select: { id: true, email: true, name: true } },
    },
  });
  return rows.map((m) => ({
    userId: m.user.id,
    email: m.user.email,
    name: m.user.name,
    status: m.status,
  }));
}

async function resolveTenantTimezone(tenantId: string): Promise<string> {
  const t = await prisma.tenant.findFirst({
    where: { id: tenantId },
    select: { timezone: true },
  });
  if (!t) throw new ServiceError("NOT_FOUND", "Tenant no encontrado");
  return t.timezone;
}

async function assertProjectInTenant(projectId: string, ctx: ServiceContext): Promise<void> {
  const p = await prisma.project.findFirst({
    where: { id: projectId, tenantId: ctx.tenantId },
    select: { id: true },
  });
  if (!p) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
}

async function assertRecipientUsers(
  recipientUserIds: string[],
  ctx: ServiceContext,
): Promise<void> {
  const unique = [...new Set(recipientUserIds)];
  if (unique.length !== recipientUserIds.length) {
    throw new ServiceError("VALIDATION", "Destinatarios duplicados");
  }
  const memberships = await prisma.userMembership.findMany({
    where: {
      tenantId: ctx.tenantId,
      userId: { in: unique },
      status: ACTIVE_MEMBERSHIP.status,
    },
    select: { userId: true },
  });
  if (memberships.length !== unique.length) {
    throw new ServiceError("VALIDATION", "Uno o más destinatarios no pertenecen al equipo activo");
  }
}

function assertReportKeys(items: { reportKey: ScheduledReportKey }[], scope: ScheduledReportScope): void {
  for (const item of items) {
    if (!isReportKeyAllowedForScope(item.reportKey, scope)) {
      throw new ServiceError("VALIDATION", `Reporte no válido para alcance ${scope}: ${item.reportKey}`);
    }
  }
}

async function assertReportKeysEnabledForTenant(
  items: { reportKey: ScheduledReportKey }[],
  ctx: ServiceContext,
): Promise<void> {
  const gate = await getTenantModuleGate(ctx);
  for (const item of items) {
    const meta = SCHEDULED_REPORT_KEY_META[item.reportKey];
    if (!meta.requiredModules.every((m) => gate.isEnabled(m))) {
      throw new ServiceError(
        "VALIDATION",
        `El reporte no está disponible con los módulos actuales del tenant: ${item.reportKey}`,
      );
    }
  }
}

function buildTimingFromInput(
  input: CreateScheduledReportInput,
  timezone: string,
  after?: Date,
): { nextRunAt: Date; dayOfWeek: number | null; dayOfMonth: number | null } {
  const dayOfWeek = input.frequency === "WEEKLY" ? (input.dayOfWeek ?? null) : null;
  const dayOfMonth = input.frequency === "MONTHLY" ? (input.dayOfMonth ?? null) : null;
  const nextRunAt = calculateNextRunAt({
    frequency: input.frequency,
    timeOfDay: input.timeOfDay,
    timezone,
    dayOfWeek,
    dayOfMonth,
    after,
  });
  return { nextRunAt, dayOfWeek, dayOfMonth };
}

function mapListRow(
  row: {
    id: string;
    name: string;
    scope: ScheduledReportScope;
    projectId: string | null;
    status: ScheduledReportStatus;
    frequency: ScheduledReportFrequency;
    format: ScheduledReportFormat;
    timeOfDay: string;
    timezone: string;
    nextRunAt: Date;
    lastRunAt: Date | null;
    lastRunStatus: ScheduledReportRunStatus | null;
    project: { code: string; name: string } | null;
    _count: { items: number; recipients: number };
  },
): ScheduledReportListRow {
  return {
    id: row.id,
    name: row.name,
    scope: row.scope,
    projectId: row.projectId,
    projectLabel: row.project ? `${row.project.code} · ${row.project.name}` : null,
    status: row.status,
    frequency: row.frequency,
    format: row.format,
    timeOfDay: row.timeOfDay,
    timezone: row.timezone,
    nextRunAt: row.nextRunAt,
    lastRunAt: row.lastRunAt,
    lastRunStatus: row.lastRunStatus,
    itemCount: row._count.items,
    recipientCount: row._count.recipients,
  };
}

const listInclude = {
  project: { select: { code: true, name: true } },
  _count: { select: { items: true, recipients: true } },
} as const;

export async function listScheduledReports(
  ctx: ServiceContext,
  filters: ScheduledReportListFilters = {},
): Promise<ScheduledReportListRow[]> {
  assertCanManageScheduledReports(ctx);

  const statusFilter = filters.status
    ? filters.status
    : filters.includeDeleted
      ? undefined
      : { not: "DELETED" as const };

  const rows = await prisma.scheduledReport.findMany({
    where: {
      tenantId: ctx.tenantId,
      ...(filters.projectId
        ? { projectId: filters.projectId, scope: "PROJECT" as const }
        : {}),
      ...(statusFilter
        ? typeof statusFilter === "string"
          ? { status: statusFilter }
          : { status: statusFilter }
        : {}),
    },
    orderBy: [{ status: "asc" }, { nextRunAt: "asc" }],
    include: listInclude,
  });

  return rows.map(mapListRow);
}

export async function getScheduledReportById(
  ctx: ServiceContext,
  id: string,
): Promise<ScheduledReportDetail> {
  assertCanManageScheduledReports(ctx);

  const row = await prisma.scheduledReport.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: {
      ...listInclude,
      items: { orderBy: { sortOrder: "asc" } },
      recipients: {
        include: { recipient: { select: { email: true, name: true } } },
      },
    },
  });
  if (!row) throw new ServiceError("NOT_FOUND", "Reporte programado no encontrado");

  const params =
    row.params && typeof row.params === "object" && !Array.isArray(row.params)
      ? (row.params as Record<string, string>)
      : null;

  return {
    ...mapListRow(row),
    dayOfWeek: row.dayOfWeek,
    dayOfMonth: row.dayOfMonth,
    params,
    items: row.items.map((i) => ({
      reportKey: i.reportKey as ScheduledReportKey,
      sortOrder: i.sortOrder,
    })),
    recipients: row.recipients.map((r) => ({
      recipientUserId: r.recipientUserId,
      email: r.recipient.email,
      name: r.recipient.name,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function createScheduledReport(
  ctx: ServiceContext,
  raw: unknown,
): Promise<ScheduledReportDetail> {
  assertCanManageScheduledReports(ctx);

  const parsed = createScheduledReportSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((e) => e.message).join("; ") || "validación";
    throw new ServiceError("VALIDATION", msg);
  }
  const input = parsed.data;

  assertReportKeys(input.items, input.scope);
  await assertReportKeysEnabledForTenant(input.items, ctx);
  if (input.scope === "PROJECT" && input.projectId) {
    await assertProjectInTenant(input.projectId, ctx);
  }
  await assertRecipientUsers(input.recipientUserIds, ctx);

  const timezone = input.timezone?.trim() || (await resolveTenantTimezone(ctx.tenantId));
  const { nextRunAt, dayOfWeek, dayOfMonth } = buildTimingFromInput(input, timezone);

  const id = await prisma.$transaction(async (tx) => {
    const created = await tx.scheduledReport.create({
      data: {
        tenantId: ctx.tenantId,
        companyId: ctx.companyId,
        projectId: input.scope === "PROJECT" ? input.projectId! : null,
        scope: input.scope,
        name: input.name,
        status: "ACTIVE",
        frequency: input.frequency,
        dayOfWeek,
        dayOfMonth,
        timeOfDay: input.timeOfDay,
        timezone,
        format: input.format,
        params: mapParams(input.params),
        createdByUserId: ctx.actorUserId,
        nextRunAt,
      },
      select: { id: true },
    });

    await tx.scheduledReportItem.createMany({
      data: input.items.map((item, index) => ({
        tenantId: ctx.tenantId,
        scheduledReportId: created.id,
        reportKey: item.reportKey,
        sortOrder: item.sortOrder ?? index,
      })),
    });

    await tx.scheduledReportRecipient.createMany({
      data: input.recipientUserIds.map((recipientUserId) => ({
        tenantId: ctx.tenantId,
        scheduledReportId: created.id,
        recipientUserId,
      })),
    });

    return created.id;
  });

  return getScheduledReportById(ctx, id);
}

export async function updateScheduledReport(
  ctx: ServiceContext,
  raw: unknown,
): Promise<ScheduledReportDetail> {
  assertCanManageScheduledReports(ctx);

  const parsed = updateScheduledReportSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((e) => e.message).join("; ") || "validación";
    throw new ServiceError("VALIDATION", msg);
  }
  const input = parsed.data;

  const existing = await prisma.scheduledReport.findFirst({
    where: { id: input.id, tenantId: ctx.tenantId },
    select: { id: true, status: true },
  });
  if (!existing) throw new ServiceError("NOT_FOUND", "Reporte programado no encontrado");
  if (existing.status === "DELETED") {
    throw new ServiceError("CONFLICT", "No se puede editar un envío eliminado");
  }

  assertReportKeys(input.items, input.scope);
  await assertReportKeysEnabledForTenant(input.items, ctx);
  if (input.scope === "PROJECT" && input.projectId) {
    await assertProjectInTenant(input.projectId, ctx);
  }
  await assertRecipientUsers(input.recipientUserIds, ctx);

  const timezone = input.timezone?.trim() || (await resolveTenantTimezone(ctx.tenantId));
  const { nextRunAt, dayOfWeek, dayOfMonth } = buildTimingFromInput(input, timezone);

  await prisma.$transaction(async (tx) => {
    await tx.scheduledReport.update({
      where: { id: input.id, tenantId: ctx.tenantId },
      data: {
        projectId: input.scope === "PROJECT" ? input.projectId! : null,
        scope: input.scope,
        name: input.name,
        frequency: input.frequency,
        dayOfWeek,
        dayOfMonth,
        timeOfDay: input.timeOfDay,
        timezone,
        format: input.format,
        params: mapParams(input.params),
        nextRunAt,
      },
    });

    await tx.scheduledReportItem.deleteMany({
      where: { scheduledReportId: input.id, tenantId: ctx.tenantId },
    });
    await tx.scheduledReportItem.createMany({
      data: input.items.map((item, index) => ({
        tenantId: ctx.tenantId,
        scheduledReportId: input.id,
        reportKey: item.reportKey,
        sortOrder: item.sortOrder ?? index,
      })),
    });

    await tx.scheduledReportRecipient.deleteMany({
      where: { scheduledReportId: input.id, tenantId: ctx.tenantId },
    });
    await tx.scheduledReportRecipient.createMany({
      data: input.recipientUserIds.map((recipientUserId) => ({
        tenantId: ctx.tenantId,
        scheduledReportId: input.id,
        recipientUserId,
      })),
    });
  });

  return getScheduledReportById(ctx, input.id);
}

export async function deactivateScheduledReport(ctx: ServiceContext, id: string): Promise<void> {
  assertCanManageScheduledReports(ctx);
  const updated = await prisma.scheduledReport.updateMany({
    where: { id, tenantId: ctx.tenantId, status: { in: ["ACTIVE"] } },
    data: { status: "PAUSED" },
  });
  if (updated.count === 0) {
    throw new ServiceError("NOT_FOUND", "Reporte programado no encontrado o ya está inactivo");
  }
}

export async function reactivateScheduledReport(ctx: ServiceContext, id: string): Promise<void> {
  assertCanManageScheduledReports(ctx);

  const row = await prisma.scheduledReport.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: {
      id: true,
      status: true,
      frequency: true,
      timeOfDay: true,
      timezone: true,
      dayOfWeek: true,
      dayOfMonth: true,
    },
  });
  if (!row) throw new ServiceError("NOT_FOUND", "Reporte programado no encontrado");
  if (row.status !== "PAUSED") {
    throw new ServiceError("CONFLICT", "Solo se puede reactivar un envío en pausa");
  }

  const nextRunAt = calculateNextRunAt({
    frequency: row.frequency,
    timeOfDay: row.timeOfDay,
    timezone: row.timezone,
    dayOfWeek: row.dayOfWeek,
    dayOfMonth: row.dayOfMonth,
  });

  await prisma.scheduledReport.update({
    where: { id: row.id, tenantId: ctx.tenantId },
    data: { status: "ACTIVE", nextRunAt },
  });
}

export async function deleteScheduledReport(ctx: ServiceContext, id: string): Promise<void> {
  assertCanManageScheduledReports(ctx);
  const updated = await prisma.scheduledReport.updateMany({
    where: { id, tenantId: ctx.tenantId, status: { not: "DELETED" } },
    data: { status: "DELETED" },
  });
  if (updated.count === 0) {
    throw new ServiceError("NOT_FOUND", "Reporte programado no encontrado");
  }
}

export type ScheduledReportCatalogEntry = { reportKey: ScheduledReportKey; labelEs: string };

export async function getScheduledReportCatalog(
  ctx: ServiceContext,
  scope: ScheduledReportScopeKind,
): Promise<ScheduledReportCatalogEntry[]> {
  assertCanManageScheduledReports(ctx);
  const gate = await getTenantModuleGate(ctx);
  return listReportKeysForScope(scope)
    .filter((key) =>
      SCHEDULED_REPORT_KEY_META[key].requiredModules.every((m) => gate.isEnabled(m)),
    )
    .map((key) => ({ reportKey: key, labelEs: SCHEDULED_REPORT_KEY_META[key].labelEs }));
}

export type ProjectPickerRow = { id: string; code: string; name: string };

export async function listProjectsForScheduledReportPicker(
  ctx: ServiceContext,
): Promise<ProjectPickerRow[]> {
  assertCanManageScheduledReports(ctx);
  return prisma.project.findMany({
    where: { tenantId: ctx.tenantId, status: { not: "CANCELLED" } },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
    take: 500,
  });
}

export { calculateNextRunAt } from "./scheduling";
