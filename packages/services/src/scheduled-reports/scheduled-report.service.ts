import { Prisma, prisma } from "@bloqer/database";
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
  parseJobsiteProjectIdsParam,
  updateScheduledReportSchema,
  type CreateScheduledReportInput,
  type ScheduledReportKey,
} from "@bloqer/validators";
import { companyScopeFilter } from "../company-scope";
import { projectRowIdWhereForScope, requireProjectAccess, resolveAccessibleProjectScope } from "../security/access";
import { ServiceContext, ServiceError } from "../types";
import { assertCanManageScheduledReports, canManageScheduledReports } from "./scheduled-report-permissions";
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
  labelEs: string;
  sortOrder: number;
};

export type ScheduledReportRecipientRow = {
  recipientUserId: string;
  email: string;
  name: string | null;
};

export type ScheduledReportDetail = ScheduledReportListRow & {
  canEditConfiguration: boolean;
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

export async function scheduledReportWhereForContext(
  ctx: ServiceContext,
): Promise<Prisma.ScheduledReportWhereInput> {
  const scope = await resolveAccessibleProjectScope(ctx);
  return {
    tenantId: ctx.tenantId,
    ...companyScopeFilter(ctx),
    AND: [{
      OR: [
        { projectId: null },
        { project: { tenantId: ctx.tenantId, ...companyScopeFilter(ctx), ...projectRowIdWhereForScope(scope) } },
      ],
    }],
  };
}

type ScheduledReportJobsiteSelection = {
  params: Prisma.JsonValue;
  items: readonly { reportKey: string }[];
};

/** D-100 stores selected project IDs in params rather than the report's project FK. */
async function filterScheduledReportsByJobsiteScope<T extends ScheduledReportJobsiteSelection>(
  rows: T[],
  ctx: ServiceContext,
): Promise<T[]> {
  const projectIdsByRow = new Map(rows.map((row) => {
    const params = row.params;
    const raw = params && typeof params === "object" && !Array.isArray(params)
      ? params.jobsiteProjectIds
      : undefined;
    const ids = row.items.some(({ reportKey }) => reportKey === "TENANT_JOBSITE_DAILY_LOGS")
      ? parseJobsiteProjectIdsParam(typeof raw === "string" ? raw : undefined)
      : [];
    return [row, ids] as const;
  }));
  const ids = [...new Set([...projectIdsByRow.values()].flat())];
  if (ids.length === 0) return rows;

  const scope = await resolveAccessibleProjectScope(ctx);
  const projects = await prisma.project.findMany({
    where: {
      tenantId: ctx.tenantId,
      ...companyScopeFilter(ctx),
      AND: [{ id: { in: ids } }, projectRowIdWhereForScope(scope)],
    },
    select: { id: true },
  });
  const authorizedIds = new Set(projects.map(({ id }) => id));
  return rows.filter((row) => projectIdsByRow.get(row)!.every((id) => authorizedIds.has(id)));
}

export async function canReadScheduledReport(id: string, ctx: ServiceContext): Promise<boolean> {
  if (!canManageScheduledReports(ctx)) return false;
  const row = await prisma.scheduledReport.findFirst({
    where: { ...await scheduledReportWhereForContext(ctx), id },
    select: { params: true, items: { select: { reportKey: true } } },
  });
  return row !== null && (await filterScheduledReportsByJobsiteScope([row], ctx)).length > 0;
}

/** Include deleted configurations for their authorized delivery history. */
export async function listReadableScheduledReportIds(ctx: ServiceContext): Promise<string[]> {
  if (!canManageScheduledReports(ctx)) return [];
  const rows = await prisma.scheduledReport.findMany({
    where: await scheduledReportWhereForContext(ctx),
    select: { id: true, params: true, items: { select: { reportKey: true } } },
  });
  return (await filterScheduledReportsByJobsiteScope(rows, ctx)).map(({ id }) => id);
}

async function requireScheduledReportForMutation(id: string, ctx: ServiceContext) {
  // The cron uses the stored company scope. A company-bound actor cannot change
  // a shared configuration that the cron will execute with tenant-wide access.
  const where = {
    ...await scheduledReportWhereForContext(ctx),
    ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
    id,
  };
  const row = await prisma.scheduledReport.findFirst({
    where,
    include: { items: { select: { reportKey: true } } },
  });
  if (!row || (await filterScheduledReportsByJobsiteScope([row], ctx)).length === 0) {
    throw new ServiceError("NOT_FOUND", "Reporte programado no encontrado");
  }
  const now = new Date();
  if (row.runLockUntil && row.runLockUntil > now) {
    throw new ServiceError("CONFLICT", "Hay una ejecución en curso. Volvé a intentar cuando termine.");
  }
  return {
    row,
    where: {
      id,
      updatedAt: row.updatedAt,
      AND: [where, { OR: [{ runLockUntil: null }, { runLockUntil: { lte: now } }] }],
    },
  };
}

function assertScheduledReportMutationSucceeded(count: number) {
  if (count !== 1) {
    throw new ServiceError("CONFLICT", "El envío cambió o empezó a ejecutarse. Actualizá e intentá de nuevo.");
  }
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

export async function assertActiveJobsiteProjectsForSchedule(
  items: readonly { reportKey: string }[],
  params: Record<string, string> | null | undefined,
  ctx: ServiceContext,
): Promise<void> {
  if (!items.some((i) => i.reportKey === "TENANT_JOBSITE_DAILY_LOGS")) return;
  const ids = parseJobsiteProjectIdsParam(params?.jobsiteProjectIds);
  if (ids.length === 0) {
    throw new ServiceError("VALIDATION", "Seleccioná al menos una obra ACTIVE para el parte diario");
  }
  const scope = await resolveAccessibleProjectScope(ctx);
  const found = await prisma.project.findMany({
    where: {
      tenantId: ctx.tenantId,
      status: "ACTIVE",
      ...companyScopeFilter(ctx),
      AND: [{ id: { in: ids } }, projectRowIdWhereForScope(scope)],
    },
    select: { id: true },
  });
  if (found.length !== ids.length) {
    throw new ServiceError(
      "VALIDATION",
      "Una o más obras del parte diario no están disponibles o no están activas",
    );
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
  if (filters.projectId) await requireProjectAccess(filters.projectId, ctx);

  const statusFilter = filters.status
    ? filters.status
    : filters.includeDeleted
      ? undefined
      : { not: "DELETED" as const };

  const rows = await prisma.scheduledReport.findMany({
    where: {
      ...await scheduledReportWhereForContext(ctx),
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
    include: { ...listInclude, items: { select: { reportKey: true } } },
  });

  return (await filterScheduledReportsByJobsiteScope(rows, ctx)).map(mapListRow);
}

export async function getScheduledReportById(
  ctx: ServiceContext,
  id: string,
): Promise<ScheduledReportDetail> {
  assertCanManageScheduledReports(ctx);

  const row = await prisma.scheduledReport.findFirst({
    where: { id, ...await scheduledReportWhereForContext(ctx) },
    include: {
      ...listInclude,
      items: { orderBy: { sortOrder: "asc" } },
      recipients: {
        include: { recipient: { select: { email: true, name: true } } },
      },
    },
  });
  if (!row || (await filterScheduledReportsByJobsiteScope([row], ctx)).length === 0) {
    throw new ServiceError("NOT_FOUND", "Reporte programado no encontrado");
  }

  const params =
    row.params && typeof row.params === "object" && !Array.isArray(row.params)
      ? (row.params as Record<string, string>)
      : null;

  return {
    ...mapListRow(row),
    canEditConfiguration: !ctx.companyId || row.companyId === ctx.companyId,
    dayOfWeek: row.dayOfWeek,
    dayOfMonth: row.dayOfMonth,
    params,
    items: row.items.map((i) => ({
      reportKey: i.reportKey as ScheduledReportKey,
      labelEs: SCHEDULED_REPORT_KEY_META[i.reportKey as ScheduledReportKey]?.labelEs ?? i.reportKey,
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
    await requireProjectAccess(input.projectId, ctx);
  }
  await assertRecipientUsers(input.recipientUserIds, ctx);
  await assertActiveJobsiteProjectsForSchedule(input.items, input.params, ctx);

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

  const { row: existing, where } = await requireScheduledReportForMutation(input.id, ctx);
  if (existing.status === "DELETED") {
    throw new ServiceError("CONFLICT", "No se puede editar un envío eliminado");
  }

  assertReportKeys(input.items, input.scope);
  await assertReportKeysEnabledForTenant(input.items, ctx);
  if (input.scope === "PROJECT" && input.projectId) {
    await requireProjectAccess(input.projectId, ctx);
  }
  await assertRecipientUsers(input.recipientUserIds, ctx);
  await assertActiveJobsiteProjectsForSchedule(input.items, input.params, ctx);

  const timezone = input.timezone?.trim() || (await resolveTenantTimezone(ctx.tenantId));
  const { nextRunAt, dayOfWeek, dayOfMonth } = buildTimingFromInput(input, timezone);

  await prisma.$transaction(async (tx) => {
    const updated = await tx.scheduledReport.updateMany({
      where,
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
        params: mapParams(input.params) ?? Prisma.DbNull,
        nextRunAt,
      },
    });
    assertScheduledReportMutationSucceeded(updated.count);

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
  const { row, where } = await requireScheduledReportForMutation(id, ctx);
  if (row.status !== "ACTIVE") {
    throw new ServiceError("CONFLICT", "Solo se puede pausar un envío activo");
  }
  const updated = await prisma.scheduledReport.updateMany({
    where: { ...where, status: "ACTIVE" },
    data: { status: "PAUSED" },
  });
  assertScheduledReportMutationSucceeded(updated.count);
}

export async function reactivateScheduledReport(ctx: ServiceContext, id: string): Promise<void> {
  assertCanManageScheduledReports(ctx);

  const { row, where } = await requireScheduledReportForMutation(id, ctx);
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

  const updated = await prisma.scheduledReport.updateMany({
    where: { ...where, status: "PAUSED" },
    data: { status: "ACTIVE", nextRunAt },
  });
  assertScheduledReportMutationSucceeded(updated.count);
}

export async function deleteScheduledReport(ctx: ServiceContext, id: string): Promise<void> {
  assertCanManageScheduledReports(ctx);
  const { row, where } = await requireScheduledReportForMutation(id, ctx);
  if (row.status === "DELETED") {
    throw new ServiceError("CONFLICT", "El envío ya está eliminado");
  }
  const updated = await prisma.scheduledReport.updateMany({
    where: { ...where, status: { not: "DELETED" } },
    data: { status: "DELETED" },
  });
  assertScheduledReportMutationSucceeded(updated.count);
}

export type ScheduledReportCatalogEntry = {
  reportKey: ScheduledReportKey;
  labelEs: string;
  group: "financial" | "operational";
};

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
    .map((key) => {
      const meta = SCHEDULED_REPORT_KEY_META[key];
      return { reportKey: key, labelEs: meta.labelEs, group: meta.group };
    });
}

export type ProjectPickerRow = { id: string; code: string; name: string };

export async function listProjectsForScheduledReportPicker(
  ctx: ServiceContext,
): Promise<ProjectPickerRow[]> {
  assertCanManageScheduledReports(ctx);
  const scope = await resolveAccessibleProjectScope(ctx);
  return prisma.project.findMany({
    where: {
      tenantId: ctx.tenantId,
      status: { not: "CANCELLED" },
      ...companyScopeFilter(ctx),
      ...projectRowIdWhereForScope(scope),
    },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
    take: 500,
  });
}

/** ACTIVE projects only — for TENANT_JOBSITE_DAILY_LOGS multi-select ([D-100]). */
export async function listActiveProjectsForJobsiteSchedulePicker(
  ctx: ServiceContext,
): Promise<ProjectPickerRow[]> {
  assertCanManageScheduledReports(ctx);
  const scope = await resolveAccessibleProjectScope(ctx);
  return prisma.project.findMany({
    where: {
      tenantId: ctx.tenantId,
      status: "ACTIVE",
      ...companyScopeFilter(ctx),
      ...projectRowIdWhereForScope(scope),
    },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
    take: 500,
  });
}

export { calculateNextRunAt, calendarDateInTimezone } from "./scheduling";
