import {
  Prisma,
  prisma,
  type JobsiteLog,
  type JobsiteLogIssueSeverity,
  type JobsiteLogIssueStatus,
  type JobsiteLogIssueType,
} from "@bloqer/database";
import { can } from "@bloqer/domain";
import {
  jobsiteLogDateSchema,
  returnJobsiteLogSchema,
  type CreateJobsiteLogInput,
  type UpdateJobsiteLogInput,
  type ReturnJobsiteLogInput,
} from "@bloqer/validators";
import { listEntityAuditLogs, log } from "../audit/audit.service";
import { getStockBalance } from "../inventory/stock-balance.service";
import {
  notifyJobsiteLogApproved,
  notifyJobsiteLogReturned,
  notifyJobsiteLogSubmitted,
} from "./jobsite-log-notifications.service";
import { createJobsiteLogMaterialStockMovements, resolveJobsiteLogMaterialWbs } from "../inventory/stock-movement.service";
import {
  assertProductUnitCompatible,
  lockProductsForUnitReferences,
} from "../inventory/product-unit";
import { assertInventoryProductScope, inventoryProductWhere, inventoryWarehouseWhere } from "../inventory/inventory-scope";
import { pickPrincipalContractualBudget } from "../budget/pick-principal-budget";
import { syncScheduleProgressFromJobsiteLog } from "../schedule/schedule-progress-sync.service";
import { assertJobsiteLogTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import { assertOptimisticRowUpdate } from "../finance/optimistic-lock";
import { ServiceContext, ServiceError } from "../types";
import { companyScopeFilter, isCrossCompany } from "../company-scope";
import {
  assertJobsiteLogApprovable,
  buildProgressSnapshotEntry,
  hasLegacyPhysicalPctOverflow,
  remainingPhysicalPct,
  type JobsiteLogProgressSnapshot,
} from "./jobsite-log-guards";
import {
  assertProjectAllowsOperationalMutation,
  lockProjectForOperationalMutation,
} from "../project/project-operational-guard";
import { requireProjectAccess } from "../security/access";

import { resolveActiveCompanyId } from "../company/company.service";
import { assertCompanyMatchesProject } from "../procurement/procurement-wbs";
import {
  isRichNoteEmpty,
  normalizeRichNote,
  toIsoDateInTimeZone,
} from "@bloqer/utils";
import { sortByWbsCode } from "../budget/wbs-code-rules";
import { serializeQtyDecimal, serializeRatePctDecimal } from "../finance/money-decimal";
import {
  canMutateJobsiteLogAsContributor,
  canSuperviseJobsiteLog,
  canViewJobsiteLogArea,
} from "./jobsite-log-access";
import {
  jobsiteLogReplayMatches,
  requireIdempotencyKey,
  withIdempotentCreate,
} from "../idempotency/idempotency";

export type WbsIncrementalProgressSnapshot = JobsiteLogProgressSnapshot;
export { hasLegacyPhysicalPctOverflow, remainingPhysicalPct, buildProgressSnapshotEntry };
export {
  canMutateJobsiteLogAsContributor,
  canSuperviseJobsiteLog,
  canViewJobsiteLogArea,
} from "./jobsite-log-access";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HUNDRED = new Prisma.Decimal(100);
const JOBSITE_LOG_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 };

// ─── View types ───────────────────────────────────────────────────────────────

export type JobsiteLogProgressView = {
  id: string;
  jobsiteLogId: string;
  wbsNodeId: string;
  description: string | null;
  quantityCompleted: string;
  physicalPct: string | null;
  notes: string | null;
  sortOrder: number;
  wbsNode: { code: string; name: string; unit: string };
};

export type JobsiteLogLaborView = {
  id: string;
  jobsiteLogId: string;
  contactId: string | null;
  subcontractId: string | null;
  crewDescription: string | null;
  workersCount: number;
  hoursWorked: string | null;
  notes: string | null;
  sortOrder: number;
  contactName: string | null;
  subcontractCode: string | null;
};

export type JobsiteLogMaterialView = {
  id: string;
  jobsiteLogId: string;
  wbsNodeId: string | null;
  productId: string | null;
  warehouseId: string | null;
  description: string;
  quantity: string;
  notes: string | null;
  sortOrder: number;
  productName: string | null;
  productUnit: string | null;
  warehouseName: string | null;
};

export type JobsiteLogIssueView = {
  id: string;
  jobsiteLogId: string;
  type: JobsiteLogIssueType;
  severity: JobsiteLogIssueSeverity;
  description: string;
  status: JobsiteLogIssueStatus;
  notes: string | null;
  sortOrder: number;
};

export type JobsiteLogView = Omit<JobsiteLog, never> & {
  projectCode: string;
  progress: JobsiteLogProgressView[];
  labor: JobsiteLogLaborView[];
  materials: JobsiteLogMaterialView[];
  issues: JobsiteLogIssueView[];
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

type RelatedCompany = { tenantId: string; companyId: string | null };
type RelatedProject = RelatedCompany & { projectId: string | null };
type JobsiteLogScope = Pick<JobsiteLog, "tenantId" | "companyId" | "projectId">;

type LogWithRelations = JobsiteLog & {
  project: { code: string };
  progress: Array<{
    id: string;
    jobsiteLogId: string;
    wbsNodeId: string;
    description: string | null;
    quantityCompleted: Prisma.Decimal;
    physicalPct: Prisma.Decimal | null;
    notes: string | null;
    sortOrder: number;
    wbsNode: { code: string; name: string; budget: RelatedProject; costItem: { unit: string } | null };
  }>;
  labor: Array<{
    id: string;
    jobsiteLogId: string;
    contactId: string | null;
    subcontractId: string | null;
    crewDescription: string | null;
    workersCount: number;
    hoursWorked: Prisma.Decimal | null;
    notes: string | null;
    sortOrder: number;
    contact: { tenantId: string; legalName: string; fantasyName: string | null } | null;
    subcontract: (RelatedProject & { number: number }) | null;
  }>;
  materials: Array<{
    id: string;
    jobsiteLogId: string;
    wbsNodeId: string | null;
    productId: string | null;
    warehouseId: string | null;
    description: string;
    quantity: Prisma.Decimal;
    notes: string | null;
    sortOrder: number;
    wbsNode: { budget: RelatedProject } | null;
    product: (RelatedCompany & { name: string; unit: string }) | null;
    warehouse: (RelatedProject & { name: string }) | null;
  }>;
  issues: Array<{
    id: string;
    jobsiteLogId: string;
    type: JobsiteLogIssueType;
    severity: JobsiteLogIssueSeverity;
    description: string;
    status: JobsiteLogIssueStatus;
    notes: string | null;
    sortOrder: number;
  }>;
};

function relatedCompanyMatchesLog(parent: RelatedCompany, log: JobsiteLogScope): boolean {
  return parent.tenantId === log.tenantId &&
    (parent.companyId === null || parent.companyId === log.companyId);
}

function relatedProjectMatchesLog(parent: RelatedProject, log: JobsiteLogScope): boolean {
  return parent.projectId === log.projectId && relatedCompanyMatchesLog(parent, log);
}

function serializeLog(l: LogWithRelations): JobsiteLogView {
  const { project, ...fields } = l;
  return {
    ...fields,
    projectCode: project.code,
    // Old imports or submissions could link a child outside the part's scope.
    progress: l.progress.filter((p) => relatedProjectMatchesLog(p.wbsNode.budget, l)).map((p) => ({
      id: p.id,
      jobsiteLogId: p.jobsiteLogId,
      wbsNodeId: p.wbsNodeId,
      description: p.description,
      quantityCompleted: serializeQtyDecimal(p.quantityCompleted),
      physicalPct: p.physicalPct != null ? serializeRatePctDecimal(p.physicalPct) : null,
      notes: p.notes,
      sortOrder: p.sortOrder,
      wbsNode: { code: p.wbsNode.code, name: p.wbsNode.name, unit: p.wbsNode.costItem?.unit ?? "" },
    })),
    labor: l.labor.map((lb) => {
      const contact = lb.contact?.tenantId === l.tenantId ? lb.contact : null;
      const subcontract = lb.subcontract && relatedProjectMatchesLog(lb.subcontract, l) &&
        lb.subcontract.companyId === l.companyId ? lb.subcontract : null;
      return {
        id: lb.id,
        jobsiteLogId: lb.jobsiteLogId,
        contactId: contact ? lb.contactId : null,
        subcontractId: subcontract ? lb.subcontractId : null,
        crewDescription: lb.crewDescription,
        workersCount: lb.workersCount,
        hoursWorked: lb.hoursWorked != null ? serializeQtyDecimal(lb.hoursWorked) : null,
        notes: lb.notes,
        sortOrder: lb.sortOrder,
        contactName: contact ? (contact.fantasyName ?? contact.legalName) : null,
        subcontractCode: subcontract ? `SC-${String(subcontract.number).padStart(3, "0")}` : null,
      };
    }),
    materials: l.materials.map((m) => {
      const product = m.product && relatedCompanyMatchesLog(m.product, l) ? m.product : null;
      const warehouse = m.warehouse && m.warehouse.tenantId === l.tenantId &&
        m.warehouse.companyId === l.companyId &&
        (m.warehouse.projectId === null || m.warehouse.projectId === l.projectId) ? m.warehouse : null;
      return {
        id: m.id,
        jobsiteLogId: m.jobsiteLogId,
        wbsNodeId: m.wbsNode && relatedProjectMatchesLog(m.wbsNode.budget, l) ? m.wbsNodeId : null,
        productId: product ? m.productId : null,
        warehouseId: warehouse ? m.warehouseId : null,
        description: m.description,
        quantity: serializeQtyDecimal(m.quantity),
        notes: m.notes,
        sortOrder: m.sortOrder,
        productName: product?.name ?? null,
        productUnit: product?.unit ?? null,
        warehouseName: warehouse?.name ?? null,
      };
    }),
    issues: l.issues.map((i) => ({
      id: i.id,
      jobsiteLogId: i.jobsiteLogId,
      type: i.type,
      severity: i.severity,
      description: i.description,
      status: i.status,
      notes: i.notes,
      sortOrder: i.sortOrder,
    })),
  };
}

const relatedCompanySelect = { tenantId: true, companyId: true } as const;
const relatedProjectSelect = { ...relatedCompanySelect, projectId: true } as const;

const logInclude = {
  project: { select: { code: true } },
  progress: {
    include: {
      wbsNode: {
        select: { code: true, name: true, costItem: { select: { unit: true } }, budget: { select: relatedProjectSelect } },
      },
    },
    orderBy: { sortOrder: "asc" as const },
  },
  labor: {
    include: {
      contact: { select: { tenantId: true, legalName: true, fantasyName: true } },
      subcontract: { select: { ...relatedProjectSelect, number: true } },
    },
    orderBy: { sortOrder: "asc" as const },
  },
  materials: {
    include: {
      wbsNode: { select: { budget: { select: relatedProjectSelect } } },
      product: { select: { ...relatedCompanySelect, name: true, unit: true } },
      warehouse: { select: { ...relatedProjectSelect, name: true } },
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
  /** Cap rows returned (newest first). Used by AI tools to avoid loading entire libro. */
  take?: number;
};

function jobsiteLogCompanyWhere(ctx: ServiceContext) {
  // JobsiteLog.companyId is NOT NULL even when its project is shared.
  return ctx.companyId ? { companyId: ctx.companyId } : {};
}

function assertJobsiteLogCompany(companyId: string, ctx: ServiceContext): void {
  if (isCrossCompany(companyId, ctx)) {
    throw new ServiceError("FORBIDDEN", "El parte no pertenece a la empresa activa");
  }
}

function assertJobsiteLogProjectCompany(logCompanyId: string, projectCompanyId: string | null): void {
  if (projectCompanyId && projectCompanyId !== logCompanyId) {
    throw new ServiceError("CONFLICT", "El parte tiene relaciones de empresa inconsistentes");
  }
}

function assertJobsiteLogExecutionDate(date: string): void {
  if (!jobsiteLogDateSchema.safeParse(date).success) {
    throw new ServiceError("VALIDATION", "Ingresá una fecha válida");
  }
  if (date > toIsoDateInTimeZone()) {
    throw new ServiceError("CONFLICT", "La fecha del parte no puede ser futura");
  }
}

function hasJobsiteLogContent(
  log: Pick<CreateJobsiteLogInput,
    | "generalNotes"
    | "blockers"
    | "incidents"
    | "safetyNotes"
    | "title"
    | "workFront"
    | "weather"
    | "shift"
  > & {
    progress?: readonly unknown[];
    labor?: readonly unknown[];
    materials?: readonly unknown[];
    issues?: readonly unknown[];
  },
): boolean {
  return (
    !isRichNoteEmpty(log.generalNotes) ||
    [log.blockers, log.incidents, log.safetyNotes, log.title, log.workFront, log.weather, log.shift]
      .some((text) => Boolean(text?.trim())) ||
    [log.progress, log.labor, log.materials, log.issues].some((rows) => (rows?.length ?? 0) > 0)
  );
}

async function lockCurrentJobsiteLog(
  tx: Prisma.TransactionClient,
  existing: JobsiteLog,
  ctx: ServiceContext,
): Promise<JobsiteLog> {
  const project = await lockProjectForOperationalMutation(tx, existing.projectId, ctx);
  await tx.$queryRaw`SELECT id FROM jobsite_logs WHERE id = ${existing.id} AND "tenantId" = ${ctx.tenantId} FOR UPDATE`;
  const current = await tx.jobsiteLog.findFirst({
    where: { id: existing.id, tenantId: ctx.tenantId, projectId: existing.projectId },
  });
  if (!current || current.status !== existing.status ||
    current.updatedAt.getTime() !== existing.updatedAt.getTime()) {
    throw new ServiceError("CONFLICT", "El parte cambió. Recargá e intentá de nuevo.");
  }
  assertJobsiteLogCompany(current.companyId, ctx);
  assertJobsiteLogProjectCompany(current.companyId, project.companyId);
  return current;
}

/** Sum of incremental physicalPct (+ qty) from jobsite logs, grouped by WBS. */
export async function getWbsIncrementalProgressSnapshot(
  projectId: string,
  ctx: ServiceContext,
  options?: {
    excludeLogId?: string;
    /** Lifecycle validation: include other SUBMITTED partes in the 100% cap. */
    includeSubmitted?: boolean;
  },
  db: Prisma.TransactionClient = prisma,
): Promise<WbsIncrementalProgressSnapshot> {
  await assertJobsiteLogTenantModule(ctx);
  if (!canViewJobsiteLogArea(ctx.roles))
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver partes de obra");
  const project = await requireProjectAccess(projectId, ctx);
  const logStatuses: Array<"APPROVED" | "SUBMITTED"> = options?.includeSubmitted
    ? ["APPROVED", "SUBMITTED"]
    : ["APPROVED"];
  const rows = await db.jobsiteLogProgress.findMany({
    where: {
      jobsiteLog: {
        tenantId: ctx.tenantId,
        projectId,
        ...jobsiteLogCompanyWhere(ctx),
        ...(project.companyId ? { companyId: project.companyId } : {}),
        status: { in: logStatuses },
        ...(options?.excludeLogId ? { id: { not: options.excludeLogId } } : {}),
      },
    },
    select: {
      wbsNodeId: true,
      physicalPct: true,
      quantityCompleted: true,
      wbsNode: { select: { budget: { select: relatedProjectSelect } } },
      jobsiteLog: { select: relatedProjectSelect },
    },
  });

  const pctSums = new Map<string, Prisma.Decimal>();
  const qtySums = new Map<string, Prisma.Decimal>();
  for (const row of rows) {
    if (!relatedProjectMatchesLog(row.wbsNode.budget, row.jobsiteLog)) continue;
    if (row.physicalPct != null) {
      const prev = pctSums.get(row.wbsNodeId) ?? new Prisma.Decimal(0);
      pctSums.set(row.wbsNodeId, prev.add(row.physicalPct));
    }
    const prevQty = qtySums.get(row.wbsNodeId) ?? new Prisma.Decimal(0);
    qtySums.set(row.wbsNodeId, prevQty.add(row.quantityCompleted));
  }

  const wbsIds = new Set([...pctSums.keys(), ...qtySums.keys()]);
  const out: WbsIncrementalProgressSnapshot = {};
  for (const wbsNodeId of wbsIds) {
    const pct = pctSums.get(wbsNodeId) ?? new Prisma.Decimal(0);
    const qty = qtySums.get(wbsNodeId) ?? new Prisma.Decimal(0);
    out[wbsNodeId] = buildProgressSnapshotEntry(
      pct.toString(),
      serializeQtyDecimal(qty),
    );
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

async function assertWbsBelongsToProject(
  wbsNodeId: string,
  projectId: string,
  ctx: ServiceContext,
  db: Prisma.TransactionClient = prisma,
) {
  const wbs = await db.wbsNode.findFirst({
    where: {
      id: wbsNodeId,
      budget: { tenantId: ctx.tenantId, projectId, ...companyScopeFilter(ctx) },
    },
    include: { budget: { select: relatedProjectSelect } },
  });
  if (!wbs) throw new ServiceError("NOT_FOUND", `Nodo EDT no encontrado: ${wbsNodeId}`);
  if (wbs.budget.tenantId !== ctx.tenantId || wbs.budget.projectId !== projectId) {
    throw new ServiceError("CONFLICT", "La partida EDT no pertenece a este proyecto");
  }
  if (wbs.type !== "ITEM") {
    throw new ServiceError("CONFLICT", `El nodo EDT "${wbs.name}" debe ser de tipo ITEM, no GROUP`);
  }
  return wbs;
}

async function validateJobsiteLogBusinessRules(
  input: Pick<CreateJobsiteLogInput, "progress" | "labor" | "materials">,
  projectId: string,
  companyId: string,
  ctx: ServiceContext,
  options?: {
    excludeLogId?: string;
    enforceStockOnLifecycle?: boolean;
  },
  db: Prisma.TransactionClient = prisma,
) {
  const { tenantId } = ctx;
  const companyCtx = { ...ctx, companyId };
  const gate = await getTenantModuleGate(ctx);
  const inventoryChecks =
    gate.isEnabled("INVENTORY") &&
    (options?.enforceStockOnLifecycle || can(ctx.roles, "VIEW", "INVENTORY"));

  const progressBudgetCompanies = new Map<string, string | null>();
  for (const { wbsNodeId } of input.progress ?? []) {
    if (!progressBudgetCompanies.has(wbsNodeId)) {
      const wbs = await assertWbsBelongsToProject(wbsNodeId, projectId, companyCtx, db);
      progressBudgetCompanies.set(wbsNodeId, wbs.budget.companyId);
    }
  }

  for (const lb of input.labor ?? []) {
    if (lb.contactId) {
      const contact = await db.contact.findUnique({ where: { id: lb.contactId } });
      if (!contact || contact.tenantId !== tenantId || contact.status !== "ACTIVE") {
        throw new ServiceError(
          "CONFLICT",
          "El contacto de mano de obra no existe o no está activo",
        );
      }
    }
    if (lb.subcontractId) {
      const sub = await db.subcontract.findFirst({
        where: { id: lb.subcontractId, tenantId, companyId, projectId },
        select: { id: true },
      });
      if (!sub)
        throw new ServiceError("NOT_FOUND", "Subcontrato no encontrado");
    }
  }

  for (const m of input.materials ?? []) {
    if (m.productId && m.warehouseId && !gate.isEnabled("INVENTORY")) {
      throw new ServiceError(
        "CONFLICT",
        "Activá Inventario o quitá el vínculo de producto y depósito para continuar con el parte",
      );
    }
    if (m.wbsNodeId) {
      await assertWbsBelongsToProject(m.wbsNodeId, projectId, companyCtx, db);
    }
    if (m.productId) {
      const product = await db.product.findFirst({
        where: { id: m.productId, ...inventoryProductWhere(companyCtx) },
        select: { status: true },
      });
      if (!product)
        throw new ServiceError("NOT_FOUND", "Producto no encontrado");
      if (inventoryChecks && product.status !== "ACTIVE")
        throw new ServiceError("CONFLICT", "El producto no está activo");
    }
    if (m.warehouseId) {
      const warehouse = await db.warehouse.findFirst({
        where: { id: m.warehouseId, tenantId, companyId, OR: [{ projectId: null }, { projectId }] },
        select: { status: true },
      });
      if (!warehouse)
        throw new ServiceError("NOT_FOUND", "Depósito no encontrado");
      if (inventoryChecks && warehouse.status !== "ACTIVE")
        throw new ServiceError("CONFLICT", "El depósito del material no está activo");
    }
    if (m.productId && m.warehouseId && new Prisma.Decimal(serializeQtyDecimal(m.quantity)).lte(0)) {
      throw new ServiceError("VALIDATION", "La cantidad del material con producto y depósito debe ser mayor a cero");
    }
    if (m.productId && m.warehouseId && options?.enforceStockOnLifecycle) {
      resolveJobsiteLogMaterialWbs(m.wbsNodeId, [...progressBudgetCompanies.keys()]);
    }
  }

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
    draftPctByWbs.set(p.wbsNodeId, prev.add(serializeRatePctDecimal(inc)));
  }

  // Compare the exact 4-decimal values persisted per line, not the rounded display snapshot.
  const totals = draftPctByWbs.size === 0 ? [] : await db.jobsiteLogProgress.groupBy({
    by: ["wbsNodeId"],
    where: {
      physicalPct: { not: null },
      jobsiteLog: {
        tenantId,
        projectId,
        status: { in: ["APPROVED", "SUBMITTED"] },
        ...(options?.excludeLogId ? { id: { not: options.excludeLogId } } : {}),
      },
      OR: [...draftPctByWbs.keys()].map((wbsNodeId) => {
        const budgetCompanyId = progressBudgetCompanies.get(wbsNodeId);
        return { wbsNodeId, ...(budgetCompanyId ? { jobsiteLog: { companyId: budgetCompanyId } } : {}) };
      }),
    },
    _sum: { physicalPct: true },
  });
  const recordedByWbs = new Map(totals.map((row) => [row.wbsNodeId, row._sum.physicalPct]));
  for (const [wbsNodeId, draftSum] of draftPctByWbs) {
    const recorded = recordedByWbs.get(wbsNodeId) ?? new Prisma.Decimal(0);
    const total = recorded.add(draftSum);
    if (total.greaterThan(HUNDRED)) {
      throw new ServiceError(
        "CONFLICT",
        "El avance acumulado de la partida, incluidos los partes enviados, no puede superar 100%",
      );
    }
  }

  if (inventoryChecks) {
    const qtyByPair = new Map<
      string,
      { productId: string; warehouseId: string; qty: Prisma.Decimal }
    >();
    for (const m of input.materials ?? []) {
      if (!m.productId || !m.warehouseId) continue;
      const key = `${m.productId}:${m.warehouseId}`;
      const qty = new Prisma.Decimal(serializeQtyDecimal(m.quantity));
      const prev = qtyByPair.get(key);
      if (prev) {
        prev.qty = prev.qty.add(qty);
      } else {
        qtyByPair.set(key, { productId: m.productId, warehouseId: m.warehouseId, qty });
      }
    }

    for (const { productId, warehouseId, qty } of qtyByPair.values()) {
      const balance = await getStockBalance({ tenantId, warehouseId, productId }, db);
      if (qty.greaterThan(balance)) {
        throw new ServiceError(
          "CONFLICT",
          `Stock insuficiente. Disponible: ${serializeQtyDecimal(balance)}, solicitado: ${serializeQtyDecimal(qty)}`,
        );
      }
    }
  }
}

async function validateJobsiteLogFromDb(
  current: JobsiteLog,
  ctx: ServiceContext,
  db: Prisma.TransactionClient,
) {
  assertJobsiteLogExecutionDate(current.logDate.toISOString().slice(0, 10));
  const existing = await db.jobsiteLog.findUnique({
    where: { id: current.id },
    include: {
      issues: { select: { id: true } },
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
          id: true,
          productId: true,
          warehouseId: true,
          wbsNodeId: true,
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
  if (!hasJobsiteLogContent(existing)) {
    throw new ServiceError("CONFLICT", "El parte debe tener al menos un campo descriptivo o una entrada");
  }

  await validateJobsiteLogBusinessRules(
    {
      progress: existing.progress.map((p) => ({
        wbsNodeId: p.wbsNodeId,
        description: p.description,
        quantityCompleted: serializeQtyDecimal(p.quantityCompleted),
        physicalPct: p.physicalPct != null ? serializeRatePctDecimal(p.physicalPct) : null,
        notes: p.notes,
        sortOrder: p.sortOrder,
      })),
      labor: existing.labor.map((lb) => ({
        contactId: lb.contactId,
        subcontractId: lb.subcontractId,
        crewDescription: lb.crewDescription,
        workersCount: lb.workersCount,
        hoursWorked: lb.hoursWorked != null ? serializeQtyDecimal(lb.hoursWorked) : null,
        notes: lb.notes,
        sortOrder: lb.sortOrder,
      })),
      materials: existing.materials.map((m) => ({
        productId: m.productId,
        warehouseId: m.warehouseId,
        wbsNodeId: m.wbsNodeId,
        description: m.description,
        quantity: serializeQtyDecimal(m.quantity),
        notes: m.notes,
        sortOrder: m.sortOrder,
      })),
    },
    current.projectId,
    current.companyId,
    ctx,
    {
      excludeLogId: current.id,
      enforceStockOnLifecycle: true,
    },
    db,
  );
  return existing;
}

async function writeChildren(
  tx: Omit<
    typeof prisma,
    "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
  >,
  logId: string,
  input: Pick<CreateJobsiteLogInput, "progress" | "labor" | "materials" | "issues">,
  ctx: ServiceContext,
) {
  const productIds = (input.materials ?? [])
    .map((line) => line.productId)
    .filter((id): id is string => Boolean(id));
  if (productIds.length > 0) {
    const parent = await tx.jobsiteLog.findUniqueOrThrow({
      where: { id: logId },
      select: { tenantId: true, companyId: true },
    });
    await tx.$queryRaw`SELECT id FROM companies WHERE id = ${parent.companyId} AND "tenantId" = ${ctx.tenantId} FOR KEY SHARE`;
    await lockProductsForUnitReferences(tx, productIds, ctx.tenantId);
    const products = await tx.product.findMany({
      where: { id: { in: productIds }, tenantId: ctx.tenantId },
    });
    if (products.length !== new Set(productIds).size)
      throw new ServiceError("NOT_FOUND", "Producto no encontrado");
    for (const product of products) {
      await assertInventoryProductScope(product, { ...ctx, companyId: parent.companyId });
      // Material usages have no separate unit column: inherit the protected product unit.
      assertProductUnitCompatible(product.unit, product.unit);
    }
  }
  for (let i = 0; i < (input.progress?.length ?? 0); i++) {
    const p = input.progress![i]!;
    await tx.jobsiteLogProgress.create({
      data: {
        jobsiteLogId: logId,
        wbsNodeId: p.wbsNodeId,
        description: p.description ?? null,
        quantityCompleted: new Prisma.Decimal(serializeQtyDecimal(p.quantityCompleted)),
        physicalPct: p.physicalPct
          ? new Prisma.Decimal(serializeRatePctDecimal(p.physicalPct))
          : null,
        notes: p.notes ?? null,
        sortOrder: p.sortOrder ?? i,
      },
    });
  }
  for (let i = 0; i < (input.labor?.length ?? 0); i++) {
    const lb = input.labor![i]!;
    await tx.jobsiteLogLabor.create({
      data: {
        jobsiteLogId: logId,
        contactId: lb.contactId ?? null,
        subcontractId: lb.subcontractId ?? null,
        crewDescription: lb.crewDescription ?? null,
        workersCount: lb.workersCount,
        hoursWorked: lb.hoursWorked ? new Prisma.Decimal(lb.hoursWorked) : null,
        notes: lb.notes ?? null,
        sortOrder: lb.sortOrder ?? i,
      },
    });
  }
  for (let i = 0; i < (input.materials?.length ?? 0); i++) {
    const m = input.materials![i]!;
    await tx.jobsiteLogMaterialUsage.create({
      data: {
        jobsiteLogId: logId,
        wbsNodeId: m.wbsNodeId ?? null,
        productId: m.productId ?? null,
        warehouseId: m.warehouseId ?? null,
        description: m.description,
        quantity: new Prisma.Decimal(serializeQtyDecimal(m.quantity)),
        notes: m.notes ?? null,
        sortOrder: m.sortOrder ?? i,
      },
    });
  }
  for (let i = 0; i < (input.issues?.length ?? 0); i++) {
    const iss = input.issues![i]!;
    await tx.jobsiteLogIssue.create({
      data: {
        jobsiteLogId: logId,
        type: iss.type,
        severity: iss.severity,
        description: iss.description,
        status: iss.status ?? "OPEN",
        notes: iss.notes ?? null,
        sortOrder: iss.sortOrder ?? i,
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
  if (l.tenantId !== ctx.tenantId)
    throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  assertJobsiteLogCompany(l.companyId, ctx);
  const project = await requireProjectAccess(l.projectId, ctx);
  assertJobsiteLogProjectCompany(l.companyId, project.companyId);
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
    select: { id: true, tenantId: true, companyId: true, projectId: true, createdBy: true, updatedBy: true },
  });
  if (!existing) throw new ServiceError("NOT_FOUND", "Parte de obra no encontrado");
  if (existing.tenantId !== ctx.tenantId)
    throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  assertJobsiteLogCompany(existing.companyId, ctx);
  const project = await requireProjectAccess(existing.projectId, ctx);
  assertJobsiteLogProjectCompany(existing.companyId, project.companyId);

  const [lifecycleRows, linkedDocs, actorUsers] = await Promise.all([
    listEntityAuditLogs(ctx.tenantId, "JobsiteLog", logId, [...JOBSITE_LOG_LIFECYCLE_ACTIONS]),
    prisma.documentAttachment.findMany({
      where: {
        tenantId: ctx.tenantId,
        projectId: existing.projectId,
        OR: [{ companyId: existing.companyId }, { companyId: null }],
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
    createdByName: existing.createdBy ? (actorNameById.get(existing.createdBy) ?? null) : null,
    updatedByName: existing.updatedBy ? (actorNameById.get(existing.updatedBy) ?? null) : null,
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
  const project = await requireProjectAccess(projectId, ctx);

  const f = filters ?? {};
  if (f.dateFrom && !jobsiteLogDateSchema.safeParse(f.dateFrom).success) {
    throw new ServiceError("CONFLICT", "Fecha «desde» inválida");
  }
  if (f.dateTo && !jobsiteLogDateSchema.safeParse(f.dateTo).success) {
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
        await assertWbsBelongsToProject(f.wbsNodeId, projectId, ctx);
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
      ...jobsiteLogCompanyWhere(ctx),
      ...(project.companyId ? { companyId: project.companyId } : {}),
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
      ...(wbsNodeIdFilter ? { progress: { some: { wbsNodeId: wbsNodeIdFilter } } } : {}),
    },
    include: logInclude,
    orderBy: [{ logDate: "desc" }, { createdAt: "desc" }],
    ...(typeof f.take === "number" && f.take > 0 ? { take: Math.min(200, f.take) } : {}),
  });
  return logs.map(serializeLog);
}

/** Pick lists for jobsite log create/edit forms (keeps Prisma out of `apps/web` pages). */
export type JobsiteLogFormPickList = {
  companyId: string;
  inventoryModuleEnabled: boolean;
  contactOptions: Array<{ id: string; legalName: string; fantasyName: string | null }>;
  productOptions: Array<{ id: string; name: string; unit: string }>;
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
  const project = await requireProjectAccess(projectId, ctx);
  const [gate, resolvedCompanyId] = await Promise.all([getTenantModuleGate(ctx), resolveActiveCompanyId(ctx, project.companyId)]);
  const scopeCtx = { ...ctx, companyId: resolvedCompanyId ?? ctx.companyId };
  const inventoryModuleEnabled = gate.isEnabled("INVENTORY") && can(ctx.roles, "VIEW", "INVENTORY");
  const warehouseWhere = inventoryModuleEnabled ? await inventoryWarehouseWhere(scopeCtx) : null;

  const [contacts, products, warehouses, subcontracts] = await Promise.all(
    [
      prisma.contact.findMany({
        where: { tenantId: ctx.tenantId, status: "ACTIVE" },
        select: { id: true, legalName: true, fantasyName: true },
        orderBy: { legalName: "asc" },
      }),
      inventoryModuleEnabled ? prisma.product.findMany({
        where: { ...inventoryProductWhere(scopeCtx), status: "ACTIVE" },
        select: { id: true, name: true, unit: true },
        orderBy: { name: "asc" },
      }) : Promise.resolve([]),
      inventoryModuleEnabled ? prisma.warehouse.findMany({
        where: { AND: [warehouseWhere!, { OR: [{ projectId: null }, { projectId }] }], status: "ACTIVE" },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }) : Promise.resolve([]),
      prisma.subcontract.findMany({
        where: { tenantId: ctx.tenantId, projectId, ...(scopeCtx.companyId ? { companyId: scopeCtx.companyId } : {}), status: "ACTIVE" },
        select: { id: true, number: true, title: true },
        orderBy: { number: "asc" },
      }),
    ],
  );

  return {
    companyId: resolvedCompanyId ?? "",
    inventoryModuleEnabled,
    contactOptions: contacts.map((c) => ({
      id: c.id,
      legalName: c.legalName,
      fantasyName: c.fantasyName,
    })),
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

  const projectForCreate = await assertProjectAllowsOperationalMutation(input.projectId, ctx);

  const companyId = await resolveActiveCompanyId(
    ctx,
    projectForCreate.companyId ?? input.companyId ?? null,
  );
  if (!companyId) {
    throw new ServiceError(
      "VALIDATION",
      "No hay una empresa activa en el tenant para registrar el parte de obra",
    );
  }
  assertJobsiteLogCompany(companyId, ctx);
  await assertCompanyMatchesProject(companyId, input.projectId, ctx.tenantId);

  const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
  const generalNotes = normalizeRichNote(input.generalNotes);
  const replayInput = { ...input, companyId, generalNotes };
  const result = await withIdempotentCreate({
    findExisting: () =>
      prisma.jobsiteLog.findFirst({
        where: { tenantId: ctx.tenantId, idempotencyKey },
        include: logInclude,
      }),
    payloadsMatch: (existing) => jobsiteLogReplayMatches(existing, replayInput),
    create: async () => {
      assertJobsiteLogExecutionDate(input.logDate);
      if (!hasJobsiteLogContent(replayInput)) {
        throw new ServiceError(
          "CONFLICT",
          "El parte debe tener al menos un campo descriptivo o una entrada",
        );
      }

      return prisma.$transaction(
        async (tx) => {
          const project = await lockProjectForOperationalMutation(tx, input.projectId, ctx);
          assertJobsiteLogProjectCompany(companyId, project.companyId);
          const row = await tx.jobsiteLog.create({
            data: {
              tenantId: ctx.tenantId,
              companyId,
              projectId: input.projectId,
              logDate: new Date(input.logDate),
              title: input.title ?? null,
              workFront: input.workFront ?? null,
              shift: input.shift ?? null,
              weather: input.weather ?? null,
              generalNotes,
              blockers: input.blockers ?? null,
              incidents: input.incidents ?? null,
              safetyNotes: input.safetyNotes ?? null,
              idempotencyKey,
              createdBy: ctx.actorUserId,
              updatedBy: ctx.actorUserId,
            },
          });
          // The unique key settles a concurrent retry before mutable stock/progress checks.
          await validateJobsiteLogBusinessRules(input, input.projectId, companyId, ctx, undefined, tx);
          await writeChildren(tx, row.id, input, ctx);
          await log(
            {
              tenantId: ctx.tenantId,
              actorUserId: ctx.actorUserId,
              companyId,
              projectId: input.projectId,
              action: "JOBSITE_LOG_CREATED",
              entityType: "JobsiteLog",
              entityId: row.id,
              after: { projectId: input.projectId, logDate: input.logDate },
            },
            tx,
          );
          return tx.jobsiteLog.findUniqueOrThrow({ where: { id: row.id }, include: logInclude });
        },
        JOBSITE_LOG_TRANSACTION_OPTIONS,
      );
    },
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
  if (existing.tenantId !== ctx.tenantId)
    throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  assertJobsiteLogCompany(existing.companyId, ctx);
  await assertProjectAllowsOperationalMutation(existing.projectId, ctx);
  if (existing.status !== "DRAFT") {
    throw new ServiceError("CONFLICT", `El parte en estado "${existing.status}" no puede editarse`);
  }

  if (input.logDate !== undefined) {
    assertJobsiteLogExecutionDate(input.logDate);
  }

  const result = await prisma.$transaction(
    async (tx) => {
      const current = await lockCurrentJobsiteLog(tx, existing, ctx);
      const updatedFields = {
        title: input.title !== undefined ? input.title : current.title,
        workFront: input.workFront !== undefined ? input.workFront : current.workFront,
        shift: input.shift !== undefined ? input.shift : current.shift,
        weather: input.weather !== undefined ? input.weather : current.weather,
        generalNotes: input.generalNotes !== undefined
          ? normalizeRichNote(input.generalNotes)
          : current.generalNotes,
        blockers: input.blockers !== undefined ? input.blockers : current.blockers,
        incidents: input.incidents !== undefined ? input.incidents : current.incidents,
        safetyNotes: input.safetyNotes !== undefined ? input.safetyNotes : current.safetyNotes,
      };
      if (!hasJobsiteLogContent({ ...input, ...updatedFields })) {
        throw new ServiceError("CONFLICT", "El parte debe tener al menos un campo descriptivo o una entrada");
      }
      await validateJobsiteLogBusinessRules(
        { progress: input.progress, labor: input.labor, materials: input.materials },
        current.projectId,
        current.companyId,
        ctx,
        { excludeLogId: id },
        tx,
      );
      await tx.jobsiteLog.update({
        where: { id },
        data: {
          ...updatedFields,
          logDate: input.logDate ? new Date(input.logDate) : current.logDate,
          updatedBy: ctx.actorUserId,
        },
      });
      // Full replacement of children
      await tx.jobsiteLogProgress.deleteMany({ where: { jobsiteLogId: id } });
      await tx.jobsiteLogLabor.deleteMany({ where: { jobsiteLogId: id } });
      await tx.jobsiteLogMaterialUsage.deleteMany({ where: { jobsiteLogId: id } });
      await tx.jobsiteLogIssue.deleteMany({ where: { jobsiteLogId: id } });
      await writeChildren(
        tx,
        id,
        {
          progress: input.progress ?? [],
          labor: input.labor ?? [],
          materials: input.materials ?? [],
          issues: input.issues ?? [],
        },
        ctx,
      );
      await log(
        {
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorUserId,
          companyId: current.companyId,
          projectId: current.projectId,
          action: "JOBSITE_LOG_UPDATED",
          entityType: "JobsiteLog",
          entityId: id,
          after: { logDate: input.logDate },
        },
        tx,
      );
      return tx.jobsiteLog.findUniqueOrThrow({ where: { id }, include: logInclude });
    },
    JOBSITE_LOG_TRANSACTION_OPTIONS,
  );

  return serializeLog(result);
}

// ─── Lifecycle transitions ────────────────────────────────────────────────────

export async function submitJobsiteLog(id: string, ctx: ServiceContext): Promise<JobsiteLogView> {
  await assertJobsiteLogTenantModule(ctx);
  if (!canMutateJobsiteLogAsContributor(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para emitir partes de obra");
  }
  const existing = await prisma.jobsiteLog.findUnique({ where: { id } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Parte de obra no encontrado");
  if (existing.tenantId !== ctx.tenantId)
    throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  assertJobsiteLogCompany(existing.companyId, ctx);
  await assertProjectAllowsOperationalMutation(existing.projectId, ctx);
  if (existing.status !== "DRAFT") {
    throw new ServiceError("CONFLICT", `El parte en estado "${existing.status}" no puede enviarse`);
  }
  const updated = await prisma.$transaction(
    async (tx) => {
      const current = await lockCurrentJobsiteLog(tx, existing, ctx);
      await validateJobsiteLogFromDb(current, ctx, tx);
      const flipped = await tx.jobsiteLog.updateMany({
        where: { id, tenantId: ctx.tenantId, status: "DRAFT" },
        data: { status: "SUBMITTED", returnNotes: null, updatedBy: ctx.actorUserId },
      });
      assertOptimisticRowUpdate(
        flipped.count,
        "El parte ya no está en borrador. Recargá e intentá de nuevo.",
      );
      const updated = await tx.jobsiteLog.findUniqueOrThrow({
        where: { id },
        include: logInclude,
      });
      await log(
        {
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorUserId,
          companyId: current.companyId,
          projectId: current.projectId,
          action: "JOBSITE_LOG_SUBMITTED",
          entityType: "JobsiteLog",
          entityId: id,
          before: { status: current.status },
          after: { status: "SUBMITTED" },
        },
        tx,
      );
      return updated;
    },
    JOBSITE_LOG_TRANSACTION_OPTIONS,
  );

  await notifyJobsiteLogSubmitted({
    ctx,
    jobsiteLogId: id,
    projectId: existing.projectId,
    companyId: existing.companyId,
    logDate: existing.logDate,
    createdBy: existing.createdBy,
  }).catch(() => undefined);

  return serializeLog(updated);
}

export async function approveJobsiteLog(id: string, ctx: ServiceContext): Promise<JobsiteLogView> {
  await assertJobsiteLogTenantModule(ctx);
  if (!canSuperviseJobsiteLog(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para aprobar partes de obra");
  }
  const existing = await prisma.jobsiteLog.findUnique({ where: { id } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Parte de obra no encontrado");
  if (existing.tenantId !== ctx.tenantId)
    throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  assertJobsiteLogCompany(existing.companyId, ctx);
  await assertProjectAllowsOperationalMutation(existing.projectId, ctx);
  assertJobsiteLogApprovable(existing.status);

  const updated = await prisma.$transaction(
    async (tx) => {
      // Serialize project lifecycle and manual schedule edits before document locks.
      const current = await lockCurrentJobsiteLog(tx, existing, ctx);
      const { materials, progress } = await validateJobsiteLogFromDb(current, ctx, tx);
      const flipped = await tx.jobsiteLog.updateMany({
        where: { id, tenantId: ctx.tenantId, status: "SUBMITTED" },
        data: { status: "APPROVED", updatedBy: ctx.actorUserId },
      });
      assertOptimisticRowUpdate(
        flipped.count,
        "El parte ya no está enviado. Recargá e intentá de nuevo.",
      );

      // Validation already enforced INVENTORY for linked lines. Manual lines have no stock effect.
      const stockMovementsCreated = await createJobsiteLogMaterialStockMovements(tx, {
        jobsiteLogId: id,
        projectId: current.projectId,
        logDate: current.logDate,
        tenantId: ctx.tenantId,
        companyId: current.companyId,
        actorUserId: ctx.actorUserId,
        progressWbsNodeIds: progress.map((p) => p.wbsNodeId),
        materials,
      });

      await syncScheduleProgressFromJobsiteLog(id, existing.projectId, ctx, tx);

      if (stockMovementsCreated > 0) {
        await log(
          {
            tenantId: ctx.tenantId,
            actorUserId: ctx.actorUserId,
            companyId: existing.companyId,
            projectId: existing.projectId,
            action: "JOBSITE_LOG_STOCK_CONSUMED",
            entityType: "JobsiteLog",
            entityId: id,
            after: { stockMovementsCreated },
          },
          tx,
        );
      }

      await log(
        {
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorUserId,
          companyId: existing.companyId,
          projectId: existing.projectId,
          action: "JOBSITE_LOG_APPROVED",
          entityType: "JobsiteLog",
          entityId: id,
          before: { status: existing.status },
          after: { status: "APPROVED" },
        },
        tx,
      );

      return tx.jobsiteLog.findUniqueOrThrow({
        where: { id },
        include: logInclude,
      });
    },
    JOBSITE_LOG_TRANSACTION_OPTIONS,
  );

  await notifyJobsiteLogApproved({
    ctx,
    jobsiteLogId: id,
    projectId: existing.projectId,
    companyId: existing.companyId,
    logDate: existing.logDate,
    createdBy: existing.createdBy,
  }).catch(() => undefined);

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
  const parsed = returnJobsiteLogSchema.safeParse(input);
  if (!parsed.success) {
    throw new ServiceError("VALIDATION", "Las observaciones son requeridas para devolver el parte");
  }
  const { returnNotes } = parsed.data;
  const existing = await prisma.jobsiteLog.findUnique({ where: { id } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Parte de obra no encontrado");
  if (existing.tenantId !== ctx.tenantId)
    throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  assertJobsiteLogCompany(existing.companyId, ctx);
  await assertProjectAllowsOperationalMutation(existing.projectId, ctx);
  if (existing.status !== "SUBMITTED") {
    throw new ServiceError(
      "CONFLICT",
      `Solo los partes enviados pueden devolverse para corrección. Estado actual: "${existing.status}"`,
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const current = await lockCurrentJobsiteLog(tx, existing, ctx);
    const returned = await tx.jobsiteLog.update({
      where: { id },
      data: { status: "DRAFT", returnNotes, updatedBy: ctx.actorUserId },
      include: logInclude,
    });
    await log({
      tenantId: ctx.tenantId,
      actorUserId: ctx.actorUserId,
      companyId: current.companyId,
      projectId: current.projectId,
      action: "JOBSITE_LOG_RETURNED",
      entityType: "JobsiteLog",
      entityId: id,
      before: { status: current.status },
      after: { status: "DRAFT", returnNotes },
    }, tx);
    return returned;
  }, JOBSITE_LOG_TRANSACTION_OPTIONS);

  await notifyJobsiteLogReturned({
    ctx,
    jobsiteLogId: id,
    projectId: existing.projectId,
    companyId: existing.companyId,
    logDate: existing.logDate,
    createdBy: existing.createdBy,
    returnNotes,
  }).catch(() => undefined);

  return serializeLog(updated);
}

export async function cancelJobsiteLog(id: string, ctx: ServiceContext): Promise<JobsiteLogView> {
  await assertJobsiteLogTenantModule(ctx);
  if (!canMutateJobsiteLogAsContributor(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para cancelar partes de obra");
  }
  const existing = await prisma.jobsiteLog.findUnique({ where: { id } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Parte de obra no encontrado");
  if (existing.tenantId !== ctx.tenantId)
    throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  assertJobsiteLogCompany(existing.companyId, ctx);
  await assertProjectAllowsOperationalMutation(existing.projectId, ctx);
  if (existing.status !== "DRAFT") {
    throw new ServiceError(
      "CONFLICT",
      `Solo los partes en borrador pueden cancelarse. Estado actual: "${existing.status}"`,
    );
  }
  const updated = await prisma.$transaction(async (tx) => {
    const current = await lockCurrentJobsiteLog(tx, existing, ctx);
    const cancelled = await tx.jobsiteLog.update({
      where: { id },
      data: { status: "CANCELLED", updatedBy: ctx.actorUserId },
      include: logInclude,
    });
    await log({
      tenantId: ctx.tenantId,
      actorUserId: ctx.actorUserId,
      companyId: current.companyId,
      projectId: current.projectId,
      action: "JOBSITE_LOG_CANCELLED",
      entityType: "JobsiteLog",
      entityId: id,
      before: { status: current.status },
      after: { status: "CANCELLED" },
    }, tx);
    return cancelled;
  }, JOBSITE_LOG_TRANSACTION_OPTIONS);
  return serializeLog(updated);
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

export async function listProjectWbsItemsForLog(projectId: string, ctx: ServiceContext) {
  await assertJobsiteLogTenantModule(ctx);
  if (!canViewJobsiteLogArea(ctx.roles)) throw new ServiceError("FORBIDDEN", "Sin permisos");
  await requireProjectAccess(projectId, ctx);

  // Scope to cost-control / schedule baseline budget — not every APPROVED+CLOSED version.
  const budgetScope = { projectId, tenantId: ctx.tenantId, ...companyScopeFilter(ctx) };
  const schedule = await prisma.schedule.findFirst({
    where: { projectId, tenantId: ctx.tenantId },
    select: { baselineBudget: { select: { id: true, projectId: true, tenantId: true, companyId: true } } },
  });
  const baseline = schedule?.baselineBudget;
  let budgetId = baseline?.projectId === projectId && baseline.tenantId === ctx.tenantId &&
    !isCrossCompany(baseline.companyId, ctx) ? baseline.id : null;
  if (!budgetId) {
    const candidates = await prisma.budget.findMany({
      where: {
        ...budgetScope,
        status: { in: ["APPROVED", "CLOSED"] },
      },
      select: { id: true, status: true, versionNumber: true, parentBudgetId: true },
    });
    budgetId = pickPrincipalContractualBudget(candidates)?.id ?? null;
  }
  if (!budgetId) return [];

  const nodes = await prisma.wbsNode.findMany({
    where: {
      type: "ITEM",
      budgetId,
      budget: budgetScope,
    },
    select: {
      id: true,
      code: true,
      name: true,
      costItem: { select: { unit: true, quantity: true } },
    },
  });
  return sortByWbsCode(nodes);
}
