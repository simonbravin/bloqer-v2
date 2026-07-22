import { Prisma, prisma, JobsiteLog } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type { CreateJobsiteLogInput, UpdateJobsiteLogInput, ReturnJobsiteLogInput } from "@bloqer/validators";
import { listEntityAuditLogs, log } from "../audit/audit.service";
import { createSystemNotification } from "../notifications/notification.service";
import { resolveNotificationAudience } from "../notifications/notification-audience.service";
import { getStockBalance } from "../inventory/stock-balance.service";
import { createJobsiteLogMaterialStockMovements } from "../inventory/stock-movement.service";
import { syncScheduleProgressFromJobsiteLog } from "../schedule/schedule-progress-sync.service";
import {
  assertInventoryTenantModule,
  assertJobsiteLogTenantModule,
} from "../tenant-modules/tenant-module-enforcement";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import { ServiceContext, ServiceError } from "../types";
import {
  assertJobsiteLogApprovable,
  hasLegacyPhysicalPctOverflow,
  type JobsiteLogProgressSnapshot,
} from "./jobsite-log-guards";
import { assertProjectAllowsOperationalMutation } from "../project/project-operational-guard";
import { sortTreeOrder } from "@bloqer/utils";

export type WbsIncrementalProgressSnapshot = JobsiteLogProgressSnapshot;
export { hasLegacyPhysicalPctOverflow };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HUNDRED = new Prisma.Decimal(100);

function canViewJobsiteLogArea(roles: ServiceContext["roles"]): boolean {
  return can(roles, "VIEW", "JOBSITE_LOG") || can(roles, "VIEW", "PROJECTS");
}

/** Create / update / submit / cancel — not approve/return (supervisor). */
function canMutateJobsiteLogAsContributor(roles: ServiceContext["roles"]): boolean {
  return can(roles, "EDIT", "JOBSITE_LOG") || can(roles, "EDIT", "PROJECTS");
}

function canSuperviseJobsiteLog(roles: ServiceContext["roles"]): boolean {
  return can(roles, "APPROVE", "JOBSITE_LOG") || can(roles, "EDIT", "PROJECTS");
}

// ─── View types ───────────────────────────────────────────────────────────────

export type JobsiteLogProgressView = {
  id:                string;
  jobsiteLogId:      string;
  wbsNodeId:         string;
  description:       string | null;
  quantityCompleted: string;
  physicalPct:       string | null;
  notes:             string | null;
  sortOrder:         number;
  wbsNode:           { code: string; name: string; unit: string };
};

export type JobsiteLogLaborView = {
  id:              string;
  jobsiteLogId:    string;
  contactId:       string | null;
  subcontractId:   string | null;
  crewDescription: string | null;
  workersCount:    number;
  hoursWorked:     string | null;
  notes:           string | null;
  sortOrder:       number;
  contactName:     string | null;
  subcontractCode: string | null;
};

export type JobsiteLogMaterialView = {
  id:           string;
  jobsiteLogId: string;
  productId:    string | null;
  warehouseId:  string | null;
  description:  string;
  quantity:     string;
  notes:        string | null;
  sortOrder:    number;
  productName:  string | null;
  warehouseName: string | null;
};

export type JobsiteLogIssueView = {
  id:           string;
  jobsiteLogId: string;
  type:         string;
  severity:     string;
  description:  string;
  status:       string;
  notes:        string | null;
  sortOrder:    number;
};

export type JobsiteLogView = Omit<JobsiteLog, never> & {
  projectCode:  string;
  progress:     JobsiteLogProgressView[];
  labor:        JobsiteLogLaborView[];
  materials:    JobsiteLogMaterialView[];
  issues:       JobsiteLogIssueView[];
};

export type JobsiteLogLifecycleLogEntry = {
  id: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  comment: string | null;
  detail: string | null;
  actorUserId: string | null;
  actorName: string | null;
  createdAt: Date;
};

export type JobsiteLogActivityLog = {
  entries: JobsiteLogLifecycleLogEntry[];
  createdByName: string | null;
  updatedByName: string | null;
};

const JOBSITE_LOG_LIFECYCLE_ACTIONS = [
  "JOBSITE_LOG_CREATED",
  "JOBSITE_LOG_UPDATED",
  "JOBSITE_LOG_SUBMITTED",
  "JOBSITE_LOG_APPROVED",
  "JOBSITE_LOG_RETURNED",
  "JOBSITE_LOG_CANCELLED",
] as const;

const JOBSITE_LOG_DOCUMENT_ACTIONS = [
  "document.created",
  "document.uploaded",
  "document.deleted",
] as const;

function parseAuditStatus(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const status = (json as { status?: unknown }).status;
  return typeof status === "string" ? status : null;
}

function parseAuditReturnNotes(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const returnNotes = (json as { returnNotes?: unknown }).returnNotes;
  return typeof returnNotes === "string" && returnNotes.trim() ? returnNotes.trim() : null;
}

function parseAuditFileName(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const originalFileName = (json as { originalFileName?: unknown }).originalFileName;
  return typeof originalFileName === "string" && originalFileName.trim()
    ? originalFileName.trim()
    : null;
}

// ─── Serializer ───────────────────────────────────────────────────────────────

type LogWithRelations = JobsiteLog & {
  project: { code: string };
  progress: Array<{
    id: string; jobsiteLogId: string; wbsNodeId: string; description: string | null;
    quantityCompleted: Prisma.Decimal; physicalPct: Prisma.Decimal | null;
    notes: string | null; sortOrder: number;
    wbsNode: { code: string; name: string; costItem: { unit: string } | null };
  }>;
  labor: Array<{
    id: string; jobsiteLogId: string; contactId: string | null; subcontractId: string | null;
    crewDescription: string | null; workersCount: number; hoursWorked: Prisma.Decimal | null;
    notes: string | null; sortOrder: number;
    contact: { legalName: string; fantasyName: string | null } | null;
    subcontract: { number: number } | null;
  }>;
  materials: Array<{
    id: string; jobsiteLogId: string; productId: string | null; warehouseId: string | null;
    description: string; quantity: Prisma.Decimal; notes: string | null; sortOrder: number;
    product: { name: string } | null;
    warehouse: { name: string } | null;
  }>;
  issues: Array<{
    id: string; jobsiteLogId: string; type: string; severity: string;
    description: string; status: string; notes: string | null; sortOrder: number;
  }>;
};

function serializeLog(l: LogWithRelations): JobsiteLogView {
  return {
    ...l,
    projectCode: l.project.code,
    progress: l.progress.map((p) => ({
      id: p.id, jobsiteLogId: p.jobsiteLogId, wbsNodeId: p.wbsNodeId,
      description: p.description,
      quantityCompleted: p.quantityCompleted.toString(),
      physicalPct: p.physicalPct?.toString() ?? null,
      notes: p.notes, sortOrder: p.sortOrder,
      wbsNode: { code: p.wbsNode.code, name: p.wbsNode.name, unit: p.wbsNode.costItem?.unit ?? "" },
    })),
    labor: l.labor.map((lb) => ({
      id: lb.id, jobsiteLogId: lb.jobsiteLogId, contactId: lb.contactId,
      subcontractId: lb.subcontractId, crewDescription: lb.crewDescription,
      workersCount: lb.workersCount,
      hoursWorked: lb.hoursWorked?.toString() ?? null,
      notes: lb.notes, sortOrder: lb.sortOrder,
      contactName: lb.contact ? (lb.contact.fantasyName ?? lb.contact.legalName) : null,
      subcontractCode: lb.subcontract ? `SC-${String(lb.subcontract.number).padStart(3, "0")}` : null,
    })),
    materials: l.materials.map((m) => ({
      id: m.id, jobsiteLogId: m.jobsiteLogId, productId: m.productId, warehouseId: m.warehouseId,
      description: m.description, quantity: m.quantity.toString(),
      notes: m.notes, sortOrder: m.sortOrder,
      productName: m.product?.name ?? null,
      warehouseName: m.warehouse?.name ?? null,
    })),
    issues: l.issues.map((i) => ({
      id: i.id, jobsiteLogId: i.jobsiteLogId, type: i.type, severity: i.severity,
      description: i.description, status: i.status, notes: i.notes, sortOrder: i.sortOrder,
    })),
  };
}

const logInclude = {
  project:   { select: { code: true } },
  progress: {
    include: { wbsNode: { include: { costItem: { select: { unit: true } } } } },
    orderBy: { sortOrder: "asc" as const },
  },
  labor: {
    include: {
      contact:     { select: { legalName: true, fantasyName: true } },
      subcontract: { select: { number: true } },
    },
    orderBy: { sortOrder: "asc" as const },
  },
  materials: {
    include: {
      product:   { select: { name: true } },
      warehouse: { select: { name: true } },
    },
    orderBy: { sortOrder: "asc" as const },
  },
  issues: { orderBy: { sortOrder: "asc" as const } },
};

// ─── Validation helpers ───────────────────────────────────────────────────────

export type JobsiteLogListFilters = {
  dateFrom?: string;
  dateTo?: string;
  wbsNodeId?: string;
  status?: string;
};

/** Sum of incremental physicalPct from jobsite logs, grouped by WBS. */
export async function getWbsIncrementalProgressSnapshot(
  projectId: string,
  ctx: ServiceContext,
  options?: {
    excludeLogId?: string;
    /** Lifecycle validation: include other SUBMITTED partes in the 100% cap. */
    includeSubmitted?: boolean;
  },
): Promise<WbsIncrementalProgressSnapshot> {
  await assertJobsiteLogTenantModule(ctx);
  const logStatuses: Array<"APPROVED" | "SUBMITTED"> = options?.includeSubmitted
    ? ["APPROVED", "SUBMITTED"]
    : ["APPROVED"];
  const rows = await prisma.jobsiteLogProgress.findMany({
    where: {
      physicalPct: { not: null },
      jobsiteLog: {
        tenantId: ctx.tenantId,
        projectId,
        status: { in: logStatuses },
        ...(options?.excludeLogId ? { id: { not: options.excludeLogId } } : {}),
      },
    },
    select: { wbsNodeId: true, physicalPct: true },
  });

  const sums = new Map<string, Prisma.Decimal>();
  for (const row of rows) {
    if (!row.physicalPct) continue;
    const prev = sums.get(row.wbsNodeId) ?? new Prisma.Decimal(0);
    sums.set(row.wbsNodeId, prev.add(row.physicalPct));
  }

  const out: WbsIncrementalProgressSnapshot = {};
  for (const [wbsNodeId, total] of sums) {
    out[wbsNodeId] = { approvedIncrementalPct: total.toFixed(2) };
  }
  return out;
}

/** Cumulative incremental physicalPct for one WBS (approved logs only). */
export async function getWbsCumulativePhysicalPct(
  projectId: string,
  wbsNodeId: string,
  ctx: ServiceContext,
): Promise<string | null> {
  const snapshot = await getWbsIncrementalProgressSnapshot(projectId, ctx);
  return snapshot[wbsNodeId]?.approvedIncrementalPct ?? null;
}


async function assertWbsBelongsToProject(wbsNodeId: string, projectId: string, tenantId: string) {
  const wbs = await prisma.wbsNode.findUnique({
    where: { id: wbsNodeId },
    include: { budget: { select: { projectId: true, tenantId: true } } },
  });
  if (!wbs) throw new ServiceError("NOT_FOUND", `Nodo WBS no encontrado: ${wbsNodeId}`);
  if (wbs.budget.tenantId !== tenantId || wbs.budget.projectId !== projectId) {
    throw new ServiceError("CONFLICT", "La partida WBS no pertenece a este proyecto");
  }
  if (wbs.type !== "ITEM") {
    throw new ServiceError("CONFLICT", `El nodo WBS "${wbs.name}" debe ser de tipo ITEM, no GROUP`);
  }
}

async function validateJobsiteLogBusinessRules(
  input: Pick<CreateJobsiteLogInput, "progress" | "labor" | "materials">,
  projectId: string,
  tenantId: string,
  ctx: ServiceContext,
  options?: {
    excludeLogId?: string;
    includeSubmittedInProgressCap?: boolean;
    enforceStockOnLifecycle?: boolean;
  },
) {
  for (const p of input.progress ?? []) {
    await assertWbsBelongsToProject(p.wbsNodeId, projectId, tenantId);
  }

  for (const lb of input.labor ?? []) {
    if (lb.contactId) {
      const contact = await prisma.contact.findUnique({ where: { id: lb.contactId } });
      if (!contact || contact.tenantId !== tenantId || contact.status !== "ACTIVE") {
        throw new ServiceError("CONFLICT", "El contacto de mano de obra no existe o no está activo");
      }
    }
    if (lb.subcontractId) {
      const sub = await prisma.subcontract.findUnique({ where: { id: lb.subcontractId } });
      if (!sub || sub.tenantId !== tenantId) throw new ServiceError("NOT_FOUND", "Subcontrato no encontrado");
      if (sub.projectId !== projectId) throw new ServiceError("CONFLICT", "El subcontrato no pertenece a este proyecto");
    }
  }

  for (const m of input.materials ?? []) {
    if (m.productId) {
      const product = await prisma.product.findUnique({ where: { id: m.productId } });
      if (!product || product.tenantId !== tenantId) throw new ServiceError("NOT_FOUND", "Producto no encontrado");
    }
    if (m.warehouseId) {
      const warehouse = await prisma.warehouse.findUnique({ where: { id: m.warehouseId } });
      if (!warehouse || warehouse.tenantId !== tenantId) throw new ServiceError("NOT_FOUND", "Depósito no encontrado");
    }
  }

  const approvedSnapshot = await getWbsIncrementalProgressSnapshot(projectId, ctx, {
    excludeLogId: options?.excludeLogId,
    includeSubmitted: options?.includeSubmittedInProgressCap ?? true,
  });

  const draftPctByWbs = new Map<string, Prisma.Decimal>();
  for (const p of input.progress ?? []) {
    if (!p.physicalPct) continue;
    const inc = new Prisma.Decimal(p.physicalPct);
    if (inc.lessThan(0)) {
      throw new ServiceError("CONFLICT", "El % físico del día no puede ser negativo");
    }
    if (inc.greaterThan(HUNDRED)) {
      throw new ServiceError("CONFLICT", "El % físico del día no puede superar 100");
    }
    const prev = draftPctByWbs.get(p.wbsNodeId) ?? new Prisma.Decimal(0);
    draftPctByWbs.set(p.wbsNodeId, prev.add(inc));
  }

  for (const [wbsNodeId, draftSum] of draftPctByWbs) {
    const approved = new Prisma.Decimal(approvedSnapshot[wbsNodeId]?.approvedIncrementalPct ?? "0");
    const total = approved.add(draftSum);
    if (total.greaterThan(HUNDRED)) {
      throw new ServiceError(
        "CONFLICT",
        `El avance acumulado no puede superar 100% (actual: ${approved.toFixed(2)}%, este parte: ${draftSum.toFixed(2)}%)`,
      );
    }
  }

  const gate = await getTenantModuleGate(ctx);
  const inventoryChecks =
    gate.isEnabled("INVENTORY") &&
    (options?.enforceStockOnLifecycle || can(ctx.roles, "VIEW", "INVENTORY"));

  if (inventoryChecks) {
    const qtyByPair = new Map<string, { productId: string; warehouseId: string; qty: Prisma.Decimal }>();
    for (const m of input.materials ?? []) {
      if (!m.productId || !m.warehouseId) continue;
      const key = `${m.productId}:${m.warehouseId}`;
      const qty = new Prisma.Decimal(m.quantity);
      const prev = qtyByPair.get(key);
      if (prev) {
        prev.qty = prev.qty.add(qty);
      } else {
        qtyByPair.set(key, { productId: m.productId, warehouseId: m.warehouseId, qty });
      }
    }

    for (const { productId, warehouseId, qty } of qtyByPair.values()) {
      const balance = await getStockBalance({ tenantId, warehouseId, productId });
      if (qty.greaterThan(balance)) {
        throw new ServiceError(
          "CONFLICT",
          `Stock insuficiente. Disponible: ${balance.toString()}, solicitado: ${qty.toString()}`,
        );
      }
    }
  }
}

async function validateJobsiteLogFromDb(
  logId: string,
  projectId: string,
  tenantId: string,
  ctx: ServiceContext,
) {
  const existing = await prisma.jobsiteLog.findUnique({
    where: { id: logId },
    include: {
      progress: {
        select: {
          wbsNodeId: true,
          description: true,
          quantityCompleted: true,
          physicalPct: true,
          notes: true,
          sortOrder: true,
        },
      },
      materials: {
        select: {
          productId: true,
          warehouseId: true,
          description: true,
          quantity: true,
          notes: true,
          sortOrder: true,
        },
      },
      labor: {
        select: {
          contactId: true,
          subcontractId: true,
          crewDescription: true,
          workersCount: true,
          hoursWorked: true,
          notes: true,
          sortOrder: true,
        },
      },
    },
  });
  if (!existing) throw new ServiceError("NOT_FOUND", "Parte de obra no encontrado");

  await validateJobsiteLogBusinessRules(
    {
      progress: existing.progress.map((p) => ({
        wbsNodeId: p.wbsNodeId,
        description: p.description,
        quantityCompleted: p.quantityCompleted.toString(),
        physicalPct: p.physicalPct?.toString() ?? null,
        notes: p.notes,
        sortOrder: p.sortOrder,
      })),
      labor: existing.labor.map((lb) => ({
        contactId: lb.contactId,
        subcontractId: lb.subcontractId,
        crewDescription: lb.crewDescription,
        workersCount: lb.workersCount,
        hoursWorked: lb.hoursWorked?.toString() ?? null,
        notes: lb.notes,
        sortOrder: lb.sortOrder,
      })),
      materials: existing.materials.map((m) => ({
        productId: m.productId,
        warehouseId: m.warehouseId,
        description: m.description,
        quantity: m.quantity.toString(),
        notes: m.notes,
        sortOrder: m.sortOrder,
      })),
    },
    projectId,
    tenantId,
    ctx,
    {
      excludeLogId: logId,
      includeSubmittedInProgressCap: true,
      enforceStockOnLifecycle: true,
    },
  );
}

async function writeChildren(
  tx: Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">,
  logId: string,
  input: Pick<CreateJobsiteLogInput, "progress" | "labor" | "materials" | "issues">,
) {
  for (let i = 0; i < (input.progress?.length ?? 0); i++) {
    const p = input.progress![i]!;
    await tx.jobsiteLogProgress.create({
      data: {
        jobsiteLogId:      logId,
        wbsNodeId:         p.wbsNodeId,
        description:       p.description ?? null,
        quantityCompleted: new Prisma.Decimal(p.quantityCompleted),
        physicalPct:       p.physicalPct ? new Prisma.Decimal(p.physicalPct) : null,
        notes:             p.notes ?? null,
        sortOrder:         p.sortOrder ?? i,
      },
    });
  }
  for (let i = 0; i < (input.labor?.length ?? 0); i++) {
    const lb = input.labor![i]!;
    await tx.jobsiteLogLabor.create({
      data: {
        jobsiteLogId:    logId,
        contactId:       lb.contactId ?? null,
        subcontractId:   lb.subcontractId ?? null,
        crewDescription: lb.crewDescription ?? null,
        workersCount:    lb.workersCount,
        hoursWorked:     lb.hoursWorked ? new Prisma.Decimal(lb.hoursWorked) : null,
        notes:           lb.notes ?? null,
        sortOrder:       lb.sortOrder ?? i,
      },
    });
  }
  for (let i = 0; i < (input.materials?.length ?? 0); i++) {
    const m = input.materials![i]!;
    await tx.jobsiteLogMaterialUsage.create({
      data: {
        jobsiteLogId: logId,
        productId:    m.productId ?? null,
        warehouseId:  m.warehouseId ?? null,
        description:  m.description,
        quantity:     new Prisma.Decimal(m.quantity),
        notes:        m.notes ?? null,
        sortOrder:    m.sortOrder ?? i,
      },
    });
  }
  for (let i = 0; i < (input.issues?.length ?? 0); i++) {
    const iss = input.issues![i]!;
    await tx.jobsiteLogIssue.create({
      data: {
        jobsiteLogId: logId,
        type:         iss.type,
        severity:     iss.severity,
        description:  iss.description,
        status:       iss.status ?? "OPEN",
        notes:        iss.notes ?? null,
        sortOrder:    iss.sortOrder ?? i,
      },
    });
  }
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getJobsiteLogById(id: string, ctx: ServiceContext): Promise<JobsiteLogView> {
  await assertJobsiteLogTenantModule(ctx);
  if (!canViewJobsiteLogArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver partes de obra");
  }
  const l = await prisma.jobsiteLog.findUnique({ where: { id }, include: logInclude });
  if (!l) throw new ServiceError("NOT_FOUND", "Parte de obra no encontrado");
  if (l.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  return serializeLog(l);
}

export async function getJobsiteLogActivityLog(
  logId: string,
  ctx: ServiceContext,
): Promise<JobsiteLogActivityLog> {
  await assertJobsiteLogTenantModule(ctx);
  if (!canViewJobsiteLogArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver partes de obra");
  }

  const existing = await prisma.jobsiteLog.findUnique({
    where: { id: logId },
    select: { id: true, tenantId: true, createdBy: true, updatedBy: true },
  });
  if (!existing) throw new ServiceError("NOT_FOUND", "Parte de obra no encontrado");
  if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const [lifecycleRows, linkedDocs, actorUsers] = await Promise.all([
    listEntityAuditLogs(
      ctx.tenantId,
      "JobsiteLog",
      logId,
      [...JOBSITE_LOG_LIFECYCLE_ACTIONS],
    ),
    prisma.documentAttachment.findMany({
      where: {
        tenantId: ctx.tenantId,
        linkedEntityType: "JOBSITE_LOG",
        linkedEntityId: logId,
      },
      select: { id: true },
    }),
    prisma.user.findMany({
      where: {
        id: {
          in: [existing.createdBy, existing.updatedBy].filter((id): id is string => Boolean(id)),
        },
      },
      select: { id: true, name: true, email: true },
    }),
  ]);

  const documentRows =
    linkedDocs.length > 0
      ? await prisma.auditLog.findMany({
          where: {
            tenantId: ctx.tenantId,
            entityType: "DocumentAttachment",
            entityId: { in: linkedDocs.map((doc) => doc.id) },
            action: { in: [...JOBSITE_LOG_DOCUMENT_ACTIONS] },
          },
          include: {
            actor: { select: { id: true, name: true, email: true } },
          },
        })
      : [];

  const actorNameById = new Map(
    actorUsers.map((user) => [user.id, user.name ?? user.email ?? null]),
  );

  const entries = [...lifecycleRows, ...documentRows]
    .map((row) => ({
      id: row.id,
      action: row.action,
      fromStatus: parseAuditStatus(row.before),
      toStatus: parseAuditStatus(row.after),
      comment: parseAuditReturnNotes(row.after),
      detail: parseAuditFileName(row.after),
      actorUserId: row.actorUserId,
      actorName: row.actor?.name ?? row.actor?.email ?? null,
      createdAt: row.createdAt,
    }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return {
    entries,
    createdByName: existing.createdBy ? actorNameById.get(existing.createdBy) ?? null : null,
    updatedByName: existing.updatedBy ? actorNameById.get(existing.updatedBy) ?? null : null,
  };
}

export async function listJobsiteLogsByProject(
  projectId: string,
  filters: JobsiteLogListFilters | undefined,
  ctx: ServiceContext,
): Promise<JobsiteLogView[]> {
  await assertJobsiteLogTenantModule(ctx);
  if (!canViewJobsiteLogArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver partes de obra");
  }
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const f = filters ?? {};
  const dateOnlyRe = /^\d{4}-\d{2}-\d{2}$/;
  if (f.dateFrom && !dateOnlyRe.test(f.dateFrom)) {
    throw new ServiceError("CONFLICT", "Fecha «desde» inválida");
  }
  if (f.dateTo && !dateOnlyRe.test(f.dateTo)) {
    throw new ServiceError("CONFLICT", "Fecha «hasta» inválida");
  }
  if (f.dateFrom && f.dateTo && f.dateFrom > f.dateTo) {
    throw new ServiceError("CONFLICT", "La fecha «desde» no puede ser posterior a «hasta»");
  }

  let wbsNodeIdFilter: string | undefined;
  if (f.wbsNodeId && f.wbsNodeId !== "__all__") {
    if (!UUID_RE.test(f.wbsNodeId)) {
      wbsNodeIdFilter = undefined;
    } else {
      try {
        await assertWbsBelongsToProject(f.wbsNodeId, projectId, ctx.tenantId);
        wbsNodeIdFilter = f.wbsNodeId;
      } catch (err) {
        if (err instanceof ServiceError && err.code === "NOT_FOUND") {
          wbsNodeIdFilter = undefined;
        } else {
          throw err;
        }
      }
    }
  }

  const logs = await prisma.jobsiteLog.findMany({
    where: {
      projectId,
      tenantId: ctx.tenantId,
      ...(f.status && ["DRAFT", "SUBMITTED", "APPROVED", "CANCELLED"].includes(f.status)
        ? { status: f.status as "DRAFT" | "SUBMITTED" | "APPROVED" | "CANCELLED" }
        : {}),
      ...(f.dateFrom || f.dateTo
        ? {
            logDate: {
              ...(f.dateFrom ? { gte: new Date(f.dateFrom) } : {}),
              ...(f.dateTo ? { lte: new Date(f.dateTo) } : {}),
            },
          }
        : {}),
      ...(wbsNodeIdFilter
        ? { progress: { some: { wbsNodeId: wbsNodeIdFilter } } }
        : {}),
    },
    include: logInclude,
    orderBy: [{ logDate: "desc" }, { createdAt: "desc" }],
  });
  return logs.map(serializeLog);
}

/** Pick lists for jobsite log create/edit forms (keeps Prisma out of `apps/web` pages). */
export type JobsiteLogFormPickList = {
  companyId: string;
  inventoryModuleEnabled: boolean;
  contactOptions: Array<{ id: string; name: string }>;
  productOptions: Array<{ id: string; name: string }>;
  warehouseOptions: Array<{ id: string; name: string }>;
  subcontractOptions: Array<{ id: string; number: number; title: string }>;
};

export async function getJobsiteLogFormPickList(
  projectId: string,
  ctx: ServiceContext,
): Promise<JobsiteLogFormPickList> {
  await assertJobsiteLogTenantModule(ctx);
  if (!canViewJobsiteLogArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver partes de obra");
  }
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { tenantId: true, companyId: true },
  });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const [contacts, products, warehouses, subcontracts, gate] = await Promise.all([
    prisma.contact.findMany({
      where: { tenantId: ctx.tenantId, status: "ACTIVE" },
      select: { id: true, legalName: true, fantasyName: true },
      orderBy: { legalName: "asc" },
    }),
    prisma.product.findMany({
      where: { tenantId: ctx.tenantId, status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.warehouse.findMany({
      where: { tenantId: ctx.tenantId, status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.subcontract.findMany({
      where: { tenantId: ctx.tenantId, projectId, status: "ACTIVE" },
      select: { id: true, number: true, title: true },
      orderBy: { number: "asc" },
    }),
    getTenantModuleGate(ctx),
  ]);

  const inventoryModuleEnabled =
    gate.isEnabled("INVENTORY") && can(ctx.roles, "VIEW", "INVENTORY");

  return {
    companyId: project.companyId ?? ctx.companyId ?? "",
    inventoryModuleEnabled,
    contactOptions: contacts.map((c) => ({ id: c.id, name: c.fantasyName ?? c.legalName })),
    productOptions: products,
    warehouseOptions: warehouses,
    subcontractOptions: subcontracts,
  };
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createJobsiteLog(
  input: CreateJobsiteLogInput,
  ctx: ServiceContext,
): Promise<JobsiteLogView> {
  await assertJobsiteLogTenantModule(ctx);
  if (!canMutateJobsiteLogAsContributor(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para crear partes de obra");
  }

  await assertProjectAllowsOperationalMutation(input.projectId, ctx.tenantId);

  const logDate = new Date(input.logDate);
  const today   = new Date(); today.setHours(23, 59, 59, 999);
  if (logDate > today) throw new ServiceError("CONFLICT", "La fecha del parte no puede ser futura");

  const hasContent =
    input.generalNotes || input.blockers || input.incidents || input.safetyNotes ||
    input.title || input.workFront || input.weather || input.shift ||
    (input.progress?.length ?? 0) > 0 ||
    (input.labor?.length ?? 0) > 0 ||
    (input.materials?.length ?? 0) > 0 ||
    (input.issues?.length ?? 0) > 0;
  if (!hasContent) {
    throw new ServiceError("CONFLICT", "El parte debe tener al menos un campo descriptivo o una entrada");
  }

  const companyId = input.companyId;
  await validateJobsiteLogBusinessRules(input, input.projectId, ctx.tenantId, ctx);

  const result = await prisma.$transaction(async (tx) => {
    const created = await tx.jobsiteLog.create({
      data: {
        tenantId:     ctx.tenantId,
        companyId,
        projectId:    input.projectId,
        logDate,
        title:        input.title ?? null,
        workFront:    input.workFront ?? null,
        shift:        input.shift ?? null,
        weather:      input.weather ?? null,
        generalNotes: input.generalNotes ?? null,
        blockers:     input.blockers ?? null,
        incidents:    input.incidents ?? null,
        safetyNotes:  input.safetyNotes ?? null,
        createdBy:    ctx.actorUserId,
        updatedBy:    ctx.actorUserId,
      },
    });
    await writeChildren(tx, created.id, input);
    return tx.jobsiteLog.findUniqueOrThrow({ where: { id: created.id }, include: logInclude });
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    companyId,
    projectId: input.projectId,
    action: "JOBSITE_LOG_CREATED",
    entityType: "JobsiteLog",
    entityId: result.id,
    after: { projectId: input.projectId, logDate: input.logDate },
  });

  return serializeLog(result);
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateJobsiteLog(
  id: string,
  input: UpdateJobsiteLogInput,
  ctx: ServiceContext,
): Promise<JobsiteLogView> {
  await assertJobsiteLogTenantModule(ctx);
  if (!canMutateJobsiteLogAsContributor(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar partes de obra");
  }

  const existing = await prisma.jobsiteLog.findUnique({ where: { id } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Parte de obra no encontrado");
  if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (existing.status !== "DRAFT") {
    throw new ServiceError("CONFLICT", `El parte en estado "${existing.status}" no puede editarse`);
  }
  await assertProjectAllowsOperationalMutation(existing.projectId, ctx.tenantId);

  if (input.logDate) {
    const logDate = new Date(input.logDate);
    const today   = new Date(); today.setHours(23, 59, 59, 999);
    if (logDate > today) throw new ServiceError("CONFLICT", "La fecha del parte no puede ser futura");
  }

  await validateJobsiteLogBusinessRules(
    { progress: input.progress, labor: input.labor, materials: input.materials },
    existing.projectId,
    ctx.tenantId,
    ctx,
    { excludeLogId: id },
  );

  const result = await prisma.$transaction(async (tx) => {
    await tx.jobsiteLog.update({
      where: { id },
      data: {
        logDate:      input.logDate ? new Date(input.logDate) : existing.logDate,
        title:        input.title        !== undefined ? input.title        : existing.title,
        workFront:    input.workFront    !== undefined ? input.workFront    : existing.workFront,
        shift:        input.shift        !== undefined ? input.shift        : existing.shift,
        weather:      input.weather      !== undefined ? input.weather      : existing.weather,
        generalNotes: input.generalNotes !== undefined ? input.generalNotes : existing.generalNotes,
        blockers:     input.blockers     !== undefined ? input.blockers     : existing.blockers,
        incidents:    input.incidents    !== undefined ? input.incidents    : existing.incidents,
        safetyNotes:  input.safetyNotes  !== undefined ? input.safetyNotes  : existing.safetyNotes,
        updatedBy:    ctx.actorUserId,
      },
    });
    // Full replacement of children
    await tx.jobsiteLogProgress.deleteMany({ where: { jobsiteLogId: id } });
    await tx.jobsiteLogLabor.deleteMany({ where: { jobsiteLogId: id } });
    await tx.jobsiteLogMaterialUsage.deleteMany({ where: { jobsiteLogId: id } });
    await tx.jobsiteLogIssue.deleteMany({ where: { jobsiteLogId: id } });
    await writeChildren(tx, id, {
      progress:  input.progress  ?? [],
      labor:     input.labor     ?? [],
      materials: input.materials ?? [],
      issues:    input.issues    ?? [],
    });
    return tx.jobsiteLog.findUniqueOrThrow({ where: { id }, include: logInclude });
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    companyId: existing.companyId,
    projectId: existing.projectId,
    action: "JOBSITE_LOG_UPDATED",
    entityType: "JobsiteLog",
    entityId: id,
    after: { logDate: input.logDate },
  });

  return serializeLog(result);
}

// ─── Lifecycle transitions ────────────────────────────────────────────────────

export async function submitJobsiteLog(id: string, ctx: ServiceContext): Promise<JobsiteLogView> {
  await assertJobsiteLogTenantModule(ctx);
  if (!canMutateJobsiteLogAsContributor(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para emitir partes de obra");
  }
  const existing = await prisma.jobsiteLog.findUnique({
    where: { id },
    include: {
      progress: { select: { id: true } },
      labor: { select: { id: true } },
      materials: { select: { id: true } },
      issues: { select: { id: true } },
    },
  });
  if (!existing) throw new ServiceError("NOT_FOUND", "Parte de obra no encontrado");
  if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (existing.status !== "DRAFT") {
    throw new ServiceError("CONFLICT", `El parte en estado "${existing.status}" no puede enviarse`);
  }
  await assertProjectAllowsOperationalMutation(existing.projectId, ctx.tenantId);
  const hasContent =
    existing.generalNotes || existing.blockers || existing.incidents || existing.safetyNotes ||
    existing.title || existing.workFront || existing.weather || existing.shift ||
    existing.progress.length > 0 ||
    existing.labor.length > 0 ||
    existing.materials.length > 0 ||
    existing.issues.length > 0;
  if (!hasContent) {
    throw new ServiceError("CONFLICT", "El parte debe tener al menos un campo descriptivo antes de enviarse");
  }

  await validateJobsiteLogFromDb(id, existing.projectId, ctx.tenantId, ctx);

  const updated = await prisma.jobsiteLog.update({
    where: { id },
    data: { status: "SUBMITTED", returnNotes: null, updatedBy: ctx.actorUserId },
    include: logInclude,
  });
  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    companyId: existing.companyId,
    projectId: existing.projectId,
    action: "JOBSITE_LOG_SUBMITTED",
    entityType: "JobsiteLog",
    entityId: id,
    before: { status: existing.status },
    after: { status: "SUBMITTED" },
  });
  return serializeLog(updated);
}

export async function approveJobsiteLog(id: string, ctx: ServiceContext): Promise<JobsiteLogView> {
  await assertJobsiteLogTenantModule(ctx);
  if (!canSuperviseJobsiteLog(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para aprobar partes de obra");
  }
  const existing = await prisma.jobsiteLog.findUnique({ where: { id } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Parte de obra no encontrado");
  if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  assertJobsiteLogApprovable(existing.status);

  await assertProjectAllowsOperationalMutation(existing.projectId, ctx.tenantId);
  await validateJobsiteLogFromDb(id, existing.projectId, ctx.tenantId, ctx);

  const gate = await getTenantModuleGate(ctx);
  if (gate.isEnabled("INVENTORY")) {
    await assertInventoryTenantModule(ctx);
  }

  let stockMovementsCreated = 0;
  const updated = await prisma.$transaction(async (tx) => {
    if (gate.isEnabled("INVENTORY")) {
      const logWithMaterials = await tx.jobsiteLog.findUniqueOrThrow({
        where: { id },
        include: { materials: true },
      });
      stockMovementsCreated = await createJobsiteLogMaterialStockMovements(tx, {
        jobsiteLogId: id,
        projectId:    existing.projectId,
        logDate:      existing.logDate,
        tenantId:     ctx.tenantId,
        companyId:    existing.companyId,
        actorUserId:  ctx.actorUserId,
        materials:    logWithMaterials.materials,
      });
    }

    await syncScheduleProgressFromJobsiteLog(id, existing.projectId, ctx, tx);

    return tx.jobsiteLog.update({
      where: { id },
      data: { status: "APPROVED", updatedBy: ctx.actorUserId },
      include: logInclude,
    });
  });

  if (stockMovementsCreated > 0) {
    await log({
      tenantId:    ctx.tenantId,
      actorUserId: ctx.actorUserId,
      companyId:   existing.companyId,
      projectId:   existing.projectId,
      action:      "JOBSITE_LOG_STOCK_CONSUMED",
      entityType:  "JobsiteLog",
      entityId:    id,
      after:       { stockMovementsCreated },
    });
  }

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    companyId: existing.companyId,
    projectId: existing.projectId,
    action: "JOBSITE_LOG_APPROVED",
    entityType: "JobsiteLog",
    entityId: id,
    before: { status: existing.status },
    after: { status: "APPROVED" },
  });
  return serializeLog(updated);
}

export async function returnJobsiteLog(
  id: string,
  input: ReturnJobsiteLogInput,
  ctx: ServiceContext,
): Promise<JobsiteLogView> {
  await assertJobsiteLogTenantModule(ctx);
  if (!canSuperviseJobsiteLog(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para devolver partes de obra");
  }
  const existing = await prisma.jobsiteLog.findUnique({ where: { id } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Parte de obra no encontrado");
  if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (existing.status !== "SUBMITTED") {
    throw new ServiceError("CONFLICT", `Solo los partes enviados pueden devolverse para corrección. Estado actual: "${existing.status}"`);
  }

  await assertProjectAllowsOperationalMutation(existing.projectId, ctx.tenantId);

  const updated = await prisma.jobsiteLog.update({
    where: { id },
    data: { status: "DRAFT", returnNotes: input.returnNotes, updatedBy: ctx.actorUserId },
    include: logInclude,
  });
  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    companyId: existing.companyId,
    projectId: existing.projectId,
    action: "JOBSITE_LOG_RETURNED",
    entityType: "JobsiteLog",
    entityId: id,
    before: { status: existing.status },
    after: { status: "DRAFT", returnNotes: input.returnNotes },
  });

  const creatorId = existing.createdBy;
  const notes = input.returnNotes?.trim();
  const body = notes
    ? `Motivo: ${notes.length > 500 ? `${notes.slice(0, 500)}…` : notes}`
    : "Un supervisor devolvió el parte a borrador.";

  const recipients = await resolveNotificationAudience({
    tenantId: ctx.tenantId,
    primaryUserIds: creatorId ? [creatorId] : [],
    excludeUserId: ctx.actorUserId,
  });

  for (const recipientUserId of recipients) {
    try {
      await createSystemNotification({
        tenantId: ctx.tenantId,
        companyId: existing.companyId,
        recipientUserId,
        type: "JOBSITE_LOG_RETURNED",
        title: "Parte devuelto para corrección",
        body,
        severity: "WARNING",
        linkedEntityType: "JOBSITE_LOG",
        linkedEntityId: id,
        projectId: existing.projectId,
        actionUrl: `/proyectos/${existing.projectId}/libro-obra/${id}/editar`,
        metadata: { jobsiteLogId: id },
      });
    } catch {
      /* best-effort in-app notification (Phase 8A) */
    }
  }

  return serializeLog(updated);
}

export async function cancelJobsiteLog(id: string, ctx: ServiceContext): Promise<JobsiteLogView> {
  await assertJobsiteLogTenantModule(ctx);
  if (!canMutateJobsiteLogAsContributor(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para cancelar partes de obra");
  }
  const existing = await prisma.jobsiteLog.findUnique({ where: { id } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Parte de obra no encontrado");
  if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (existing.status !== "DRAFT") {
    throw new ServiceError("CONFLICT", `Solo los partes en borrador pueden cancelarse. Estado actual: "${existing.status}"`);
  }
  const updated = await prisma.jobsiteLog.update({
    where: { id }, data: { status: "CANCELLED", updatedBy: ctx.actorUserId }, include: logInclude,
  });
  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    companyId: existing.companyId,
    projectId: existing.projectId,
    action: "JOBSITE_LOG_CANCELLED",
    entityType: "JobsiteLog",
    entityId: id,
    before: { status: existing.status },
    after: { status: "CANCELLED" },
  });
  return serializeLog(updated);
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

export async function listProjectWbsItemsForLog(projectId: string, ctx: ServiceContext) {
  await assertJobsiteLogTenantModule(ctx);
  if (!canViewJobsiteLogArea(ctx.roles)) throw new ServiceError("FORBIDDEN", "Sin permisos");
  const nodes = await prisma.wbsNode.findMany({
    where: {
      type: "ITEM",
      budget: {
        projectId,
        tenantId: ctx.tenantId,
        status: { in: ["APPROVED", "CLOSED"] },
      },
    },
    select: {
      id: true,
      code: true,
      name: true,
      parentId: true,
      sortOrder: true,
      costItem: { select: { unit: true } },
    },
  });
  return sortTreeOrder(nodes, (a, b) => a.code.localeCompare(b.code, "es"));
}
