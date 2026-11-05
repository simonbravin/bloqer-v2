import { prisma, type Prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import {
  ALL_PROJECT_SCOPED_ENTITY_TYPES,
  AUDIT_MODULES_WITHOUT_PROJECT_SCOPE,
  AUDIT_UI_MODULE_LABEL_ES,
  entityTypesForAuditModule,
  resolveAuditActionLabel,
  resolveAuditModuleForEntityType,
  type AuditUiModule,
} from "@bloqer/domain";
import { listTenantAuditLogFiltersSchema } from "@bloqer/validators";
import { formatDateTime, formatTimezoneOptionLabel } from "@bloqer/utils";
import { ServiceContext, ServiceError } from "../types";
import { companyScopeFilter, isCrossCompany } from "../company-scope";
import { projectIdWhereForScope, projectRowIdWhereForScope, requireProjectAccess, resolveAccessibleProjectScope } from "../security/access";
import { sanitizeAuditPayload } from "./audit-sanitize";
import { filterAuditLegacyScope } from "./audit-legacy-scope";
import {
  decodeAuditLogCursor,
  encodeAuditLogCursor,
  extractAuditReference,
  formatAuditActorLabel,
  parseAuditReferenceFilter,
  parseAuditDateFrom,
  parseAuditDateToInclusive,
} from "./audit-display";
import { resolveEntityIdsForProject } from "./audit-project-resolver";
import { buildCsv } from "../report-exports/csv-export.service";
import { safeReportFilename } from "../report-exports/filename.service";
import type { ReportCsvPayload } from "../report-exports/report-export.types";
import { getTenantDisplayTimezone } from "../tenant-settings/tenant-settings.service";
import { assertTenantModuleEnabled } from "../tenant-modules/tenant-module.service";

export const MAX_TENANT_AUDIT_LOG_EXPORT_ROWS = 10_000;

export type TenantAuditLogRow = {
  id: string;
  action: string;
  actionLabel: string;
  entityType: string;
  entityId: string;
  module: AuditUiModule | null;
  reference: string | null;
  actorUserId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  actorLabel: string;
  projectId: string | null;
  projectName: string | null;
  companyId: string | null;
  ipAddress: string | null;
  createdAt: Date;
};

export type TenantAuditLogDetail = TenantAuditLogRow & {
  before: unknown;
  after: unknown;
};

export type ListTenantAuditLogResult = {
  rows: TenantAuditLogRow[];
  nextCursor: string | null;
};

export type ListTenantAuditLogFilters = {
  module?: AuditUiModule;
  projectId?: string;
  companyId?: string;
  actorUserId?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  dateFrom?: Date;
  dateTo?: Date;
  reference?: string;
  cursor?: string;
  limit?: number;
};

/** URL/export filter shape with YYYY-MM-DD date strings (no pagination). */
export type TenantAuditLogExportUrlFilters = {
  module?: AuditUiModule;
  projectId?: string;
  companyId?: string;
  actorUserId?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  reference?: string;
  dateFrom?: string;
  dateTo?: string;
};

export function resolveTenantAuditLogExportFilters(
  input: TenantAuditLogExportUrlFilters,
  timeZone = "UTC",
): Omit<ListTenantAuditLogFilters, "cursor" | "limit"> {
  return {
    module: input.module,
    projectId: input.projectId,
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    reference: input.reference,
    dateFrom: input.dateFrom ? parseAuditDateFrom(input.dateFrom, timeZone) : undefined,
    dateTo: input.dateTo ? parseAuditDateToInclusive(input.dateTo, timeZone) : undefined,
  };
}

async function assertCanViewAuditLog(ctx: ServiceContext): Promise<void> {
  if (!can(ctx.roles, "VIEW", "AUDIT")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver el registro de actividad");
  }
  await assertTenantModuleEnabled(ctx, "AUDIT");
}

function parseFilters(raw: ListTenantAuditLogFilters) {
  const parsed = listTenantAuditLogFiltersSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ") || "validación";
    throw new ServiceError("VALIDATION", msg);
  }
  if (parsed.data.dateFrom && parsed.data.dateTo && parsed.data.dateFrom > parsed.data.dateTo) {
    throw new ServiceError("VALIDATION", "Desde debe ser anterior o igual a Hasta");
  }
  return parsed.data;
}

async function buildProjectFilter(
  ctx: ServiceContext,
  projectId: string,
  entityTypes: readonly string[],
): Promise<Prisma.AuditLogWhereInput> {
  const legacyIds = await resolveEntityIdsForProject(ctx, projectId, entityTypes);

  const orClauses: Prisma.AuditLogWhereInput[] = [{ projectId }];

  if (legacyIds.length > 0) {
    orClauses.push({
      projectId: null,
      entityType: { in: [...entityTypes] },
      entityId: { in: legacyIds },
    });
  }

  return { OR: orClauses };
}

async function auditReadScope(ctx: ServiceContext): Promise<Prisma.AuditLogWhereInput> {
  const projects = await resolveAccessibleProjectScope(ctx);
  return {
    tenantId: ctx.tenantId,
    AND: [
      companyScopeFilter(ctx),
      { OR: [{ companyId: null }, { company: { tenantId: ctx.tenantId } }] },
      { OR: [{ projectId: null }, { ...projectIdWhereForScope(projects), project: { tenantId: ctx.tenantId } }] },
    ],
  };
}

async function buildWhereClause(
  ctx: ServiceContext,
  input: ReturnType<typeof parseFilters>,
): Promise<Prisma.AuditLogWhereInput> {
  if (input.companyId && isCrossCompany(input.companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "La empresa del filtro no coincide con tu acceso");
  }
  const parts: Prisma.AuditLogWhereInput[] = [await auditReadScope(ctx)];

  if (input.module) {
    parts.push({ entityType: { in: [...entityTypesForAuditModule(input.module)] } });
  }
  if (input.entityType) parts.push({ entityType: input.entityType });
  if (input.entityId) parts.push({ entityId: input.entityId });
  if (input.actorUserId) parts.push({ actorUserId: input.actorUserId });
  if (input.companyId) parts.push({ companyId: input.companyId });
  if (input.action) parts.push({ action: input.action });

  if (input.dateFrom || input.dateTo) {
    parts.push({
      createdAt: {
        ...(input.dateFrom ? { gte: input.dateFrom } : {}),
        ...(input.dateTo ? { lte: input.dateTo } : {}),
      },
    });
  }

  if (input.reference) {
    const docNumber = parseAuditReferenceFilter(input.reference);
    if (docNumber == null) {
      throw new ServiceError(
        "VALIDATION",
        "El nº documento debe ser numérico (ej. 142 o #142)",
      );
    }
    const docRef = String(docNumber);
    parts.push({
      OR: [
        { after: { path: ["number"], equals: docNumber } },
        { before: { path: ["number"], equals: docNumber } },
        { after: { path: ["number"], equals: docRef } },
        { before: { path: ["number"], equals: docRef } },
      ],
    });
  }

  const skipProjectFilter =
    input.module != null &&
    (AUDIT_MODULES_WITHOUT_PROJECT_SCOPE as readonly string[]).includes(input.module);

  if (input.projectId && !skipProjectFilter) {
    await requireProjectAccess(input.projectId, ctx);
    const scopedTypes = input.module
      ? entityTypesForAuditModule(input.module)
      : ALL_PROJECT_SCOPED_ENTITY_TYPES;
    parts.push(await buildProjectFilter(ctx, input.projectId, scopedTypes));
  }

  return parts.length === 1 ? parts[0]! : { AND: parts };
}

const listSelect = {
  id: true,
  action: true,
  entityType: true,
  entityId: true,
  projectId: true,
  companyId: true,
  ipAddress: true,
  createdAt: true,
  before: true,
  after: true,
  actorUserId: true,
  actor: { select: { name: true, email: true } },
  project: { select: { name: true } },
} as const;

function beforeCursor(createdAt: Date, id: string): Prisma.AuditLogWhereInput {
  return { OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }] };
}

/** Fill the page with visible rows; skipped historical records cannot consume a result slot. */
async function findVisibleAuditRows(where: Prisma.AuditLogWhereInput, count: number, ctx: ServiceContext) {
  const orderBy = [{ createdAt: "desc" }, { id: "desc" }] satisfies Prisma.AuditLogOrderByWithRelationInput[];
  if (!ctx.companyId) return prisma.auditLog.findMany({ where, orderBy, take: count, select: listSelect });

  const take = Math.min(250, Math.max(50, count));
  let scanAfter: Prisma.AuditLogWhereInput | undefined;
  const visible: Prisma.AuditLogGetPayload<{ select: typeof listSelect }>[] = [];
  while (visible.length < count) {
    const batch = await prisma.auditLog.findMany({
      where: scanAfter ? { AND: [where, scanAfter] } : where,
      orderBy, take, select: listSelect,
    });
    visible.push(...await filterAuditLegacyScope(batch, ctx));
    if (batch.length < take) break;
    const last = batch.at(-1)!;
    scanAfter = beforeCursor(last.createdAt, last.id);
  }
  return visible.slice(0, count);
}

function mapRow(r: {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  projectId: string | null;
  companyId: string | null;
  ipAddress: string | null;
  createdAt: Date;
  before: unknown;
  after: unknown;
  actorUserId: string | null;
  actor: { name: string | null; email: string } | null;
  project: { name: string } | null;
}): TenantAuditLogRow {
  return {
    id: r.id,
    action: r.action,
    actionLabel: resolveAuditActionLabel(r.action),
    entityType: r.entityType,
    entityId: r.entityId,
    module: resolveAuditModuleForEntityType(r.entityType),
    reference: extractAuditReference(r.before, r.after),
    actorUserId: r.actorUserId,
    actorName: r.actor?.name ?? null,
    actorEmail: r.actor?.email ?? null,
    actorLabel: formatAuditActorLabel(r.actorUserId, r.actor?.name, r.actor?.email),
    projectId: r.projectId,
    projectName: r.project?.name ?? null,
    companyId: r.companyId,
    ipAddress: r.ipAddress,
    createdAt: r.createdAt,
  };
}

export async function listTenantAuditLog(
  filters: ListTenantAuditLogFilters,
  ctx: ServiceContext,
): Promise<ListTenantAuditLogResult> {
  await assertCanViewAuditLog(ctx);
  const input = parseFilters(filters);
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);

  const where = await buildWhereClause(ctx, input);

  let cursorWhere: Prisma.AuditLogWhereInput | undefined;
  if (input.cursor) {
    const decoded = decodeAuditLogCursor(input.cursor);
    if (!decoded) {
      throw new ServiceError("VALIDATION", "Cursor de paginación inválido");
    }
    cursorWhere = beforeCursor(new Date(decoded.createdAt), decoded.id);
  }

  const rows = await findVisibleAuditRows(cursorWhere ? { AND: [where, cursorWhere] } : where, limit + 1, ctx);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page.at(-1);

  return {
    rows: page.map(mapRow),
    nextCursor: hasMore && last ? encodeAuditLogCursor(last.createdAt, last.id) : null,
  };
}

export async function getTenantAuditLogEntry(
  id: string,
  ctx: ServiceContext,
): Promise<TenantAuditLogDetail> {
  await assertCanViewAuditLog(ctx);

  const row = await prisma.auditLog.findFirst({
    where: { id, ...await auditReadScope(ctx) },
    select: listSelect,
  });

  if (!row || (await filterAuditLegacyScope([row], ctx)).length === 0) {
    throw new ServiceError("NOT_FOUND", "Registro de auditoría no encontrado");
  }

  const mapped = mapRow(row);
  return {
    ...mapped,
    before: sanitizeAuditPayload(row.before) ?? null,
    after: sanitizeAuditPayload(row.after) ?? null,
  };
}

export type AuditActorOption = {
  userId: string;
  name: string | null;
  email: string;
};

export type AuditProjectOption = {
  id: string;
  name: string;
  code: string;
};

export async function listAuditActorOptions(ctx: ServiceContext): Promise<AuditActorOption[]> {
  await assertCanViewAuditLog(ctx);
  const rows = await prisma.userMembership.findMany({
    where: { tenantId: ctx.tenantId, status: "ACTIVE", ...companyScopeFilter(ctx) },
    orderBy: { createdAt: "asc" },
    select: {
      user: { select: { id: true, name: true, email: true } },
    },
  });
  return rows.map((r) => ({
    userId: r.user.id,
    name: r.user.name,
    email: r.user.email,
  }));
}

export async function listAuditProjectOptions(ctx: ServiceContext): Promise<AuditProjectOption[]> {
  await assertCanViewAuditLog(ctx);
  return prisma.project.findMany({
    where: { tenantId: ctx.tenantId, ...projectRowIdWhereForScope(await resolveAccessibleProjectScope(ctx)) },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
    take: 500,
  });
}

function jsonForCsv(value: unknown): string {
  if (value == null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

export type TenantAuditLogExportRow = TenantAuditLogRow & {
  before: unknown;
  after: unknown;
};

export type TenantAuditLogExportResult = {
  rows: TenantAuditLogExportRow[];
  truncated: boolean;
};

export async function fetchTenantAuditLogForExport(
  filters: Omit<ListTenantAuditLogFilters, "cursor" | "limit">,
  ctx: ServiceContext,
  maxRows: number,
): Promise<TenantAuditLogExportResult> {
  await assertCanViewAuditLog(ctx);
  const input = parseFilters(filters);
  const where = await buildWhereClause(ctx, input);

  const rawRows = await findVisibleAuditRows(where, maxRows + 1, ctx);

  const truncated = rawRows.length > maxRows;
  const page = truncated ? rawRows.slice(0, maxRows) : rawRows;

  const rows = page.map((r) => {
    const mapped = mapRow(r);
    return {
      ...mapped,
      before: sanitizeAuditPayload(r.before) ?? null,
      after: sanitizeAuditPayload(r.after) ?? null,
    };
  });

  return { rows, truncated };
}

export async function exportTenantAuditLogCsv(
  filters: Omit<ListTenantAuditLogFilters, "cursor" | "limit">,
  ctx: ServiceContext,
): Promise<ReportCsvPayload> {
  const [{ rows: page, truncated }, timeZone] = await Promise.all([
    fetchTenantAuditLogForExport(filters, ctx, MAX_TENANT_AUDIT_LOG_EXPORT_ROWS),
    getTenantDisplayTimezone(ctx),
  ]);

  const headers = [
    "ID registro",
    `Fecha (${formatTimezoneOptionLabel(timeZone)})`,
    "Usuario",
    "Email",
    "Módulo",
    "Acción",
    "Código acción",
    "Tipo entidad",
    "ID entidad",
    "Referencia",
    "Proyecto",
    "ID proyecto",
    "ID empresa",
    "IP",
    "Antes (JSON)",
    "Después (JSON)",
  ];

  const rows = page.map((r) => {
    const moduleLabel = r.module ? AUDIT_UI_MODULE_LABEL_ES[r.module] : "";
    return [
      r.id,
      formatDateTime(r.createdAt, { timeZone }),
      r.actorLabel,
      r.actorEmail ?? "",
      moduleLabel,
      r.actionLabel,
      r.action,
      r.entityType,
      r.entityId,
      r.reference ?? "",
      r.projectName ?? "",
      r.projectId ?? "",
      r.companyId ?? "",
      r.ipAddress ?? "",
      jsonForCsv(r.before),
      jsonForCsv(r.after),
    ];
  });

  const dateStamp = new Date().toISOString().slice(0, 10);
  const base = truncated
    ? `registro_actividad_${dateStamp}_truncado_${MAX_TENANT_AUDIT_LOG_EXPORT_ROWS}`
    : `registro_actividad_${dateStamp}`;

  return {
    content: buildCsv(headers, rows),
    filename: safeReportFilename(base, "csv"),
  };
}
