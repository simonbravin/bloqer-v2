import { Prisma, prisma, JobsiteLog } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type { CreateJobsiteLogInput, UpdateJobsiteLogInput, ReturnJobsiteLogInput } from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { createSystemNotification } from "../notifications/notification.service";
import { assertJobsiteLogTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";
import { assertProjectAllowsOperationalMutation } from "../project/project-operational-guard";

function canViewJobsiteLogArea(roles: ServiceContext["roles"]): boolean {
  return can(roles, "VIEW", "JOBSITE_LOG") || can(roles, "VIEW", "PROJECTS");
}

/** Create / update / submit / cancel — not approve/return (supervisor). */
function canMutateJobsiteLogAsContributor(roles: ServiceContext["roles"]): boolean {
  return can(roles, "EDIT", "JOBSITE_LOG") || can(roles, "EDIT", "PROJECTS");
}

function canSuperviseJobsiteLog(roles: ServiceContext["roles"]): boolean {
  return can(roles, "EDIT", "PROJECTS");
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

async function validateChildren(
  input: Pick<CreateJobsiteLogInput, "progress" | "labor" | "materials">,
  projectId: string,
  tenantId: string,
) {
  for (const p of input.progress ?? []) {
    const wbs = await prisma.wbsNode.findUnique({ where: { id: p.wbsNodeId } });
    if (!wbs) throw new ServiceError("NOT_FOUND", `Nodo WBS no encontrado: ${p.wbsNodeId}`);
    if (wbs.type !== "ITEM") throw new ServiceError("CONFLICT", `El nodo WBS "${wbs.name}" debe ser de tipo ITEM, no GROUP`);
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

export async function listJobsiteLogsByProject(
  projectId: string,
  ctx: ServiceContext,
): Promise<JobsiteLogView[]> {
  await assertJobsiteLogTenantModule(ctx);
  if (!canViewJobsiteLogArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver partes de obra");
  }
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const logs = await prisma.jobsiteLog.findMany({
    where: { projectId, tenantId: ctx.tenantId },
    include: logInclude,
    orderBy: [{ logDate: "desc" }, { createdAt: "desc" }],
  });
  return logs.map(serializeLog);
}

/** Pick lists for jobsite log create/edit forms (keeps Prisma out of `apps/web` pages). */
export type JobsiteLogFormPickList = {
  companyId: string;
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

  const [contacts, products, warehouses, subcontracts] = await Promise.all([
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
  ]);

  return {
    companyId: project.companyId ?? ctx.companyId ?? "",
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
    input.title || input.workFront ||
    (input.progress?.length ?? 0) > 0 || (input.labor?.length ?? 0) > 0;
  if (!hasContent) {
    throw new ServiceError("CONFLICT", "El parte debe tener al menos un campo descriptivo o una entrada");
  }

  const companyId = input.companyId;
  await validateChildren(input, input.projectId, ctx.tenantId);

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
    tenantId: ctx.tenantId, actorUserId: ctx.actorUserId,
    action: "JOBSITE_LOG_CREATED", entityType: "JobsiteLog", entityId: result.id,
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

  await validateChildren(
    { progress: input.progress, labor: input.labor, materials: input.materials },
    existing.projectId,
    ctx.tenantId,
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
    tenantId: ctx.tenantId, actorUserId: ctx.actorUserId,
    action: "JOBSITE_LOG_UPDATED", entityType: "JobsiteLog", entityId: id,
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
    include: { progress: { select: { id: true } }, labor: { select: { id: true } } },
  });
  if (!existing) throw new ServiceError("NOT_FOUND", "Parte de obra no encontrado");
  if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (existing.status !== "DRAFT") {
    throw new ServiceError("CONFLICT", `El parte en estado "${existing.status}" no puede enviarse`);
  }
  await assertProjectAllowsOperationalMutation(existing.projectId, ctx.tenantId);
  const hasContent =
    existing.generalNotes || existing.blockers || existing.incidents || existing.safetyNotes ||
    existing.title || existing.workFront ||
    existing.progress.length > 0 || existing.labor.length > 0;
  if (!hasContent) {
    throw new ServiceError("CONFLICT", "El parte debe tener al menos un campo descriptivo antes de enviarse");
  }

  const updated = await prisma.jobsiteLog.update({
    where: { id }, data: { status: "SUBMITTED", updatedBy: ctx.actorUserId }, include: logInclude,
  });
  await log({
    tenantId: ctx.tenantId, actorUserId: ctx.actorUserId,
    action: "JOBSITE_LOG_SUBMITTED", entityType: "JobsiteLog", entityId: id, after: { status: "SUBMITTED" },
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
  if (existing.status !== "SUBMITTED") {
    throw new ServiceError("CONFLICT", `El parte en estado "${existing.status}" no puede aprobarse. Debe estar enviado.`);
  }
  const updated = await prisma.jobsiteLog.update({
    where: { id }, data: { status: "APPROVED", updatedBy: ctx.actorUserId }, include: logInclude,
  });
  await log({
    tenantId: ctx.tenantId, actorUserId: ctx.actorUserId,
    action: "JOBSITE_LOG_APPROVED", entityType: "JobsiteLog", entityId: id, after: { status: "APPROVED" },
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
  const updated = await prisma.jobsiteLog.update({
    where: { id },
    data: { status: "DRAFT", returnNotes: input.returnNotes, updatedBy: ctx.actorUserId },
    include: logInclude,
  });
  await log({
    tenantId: ctx.tenantId, actorUserId: ctx.actorUserId,
    action: "JOBSITE_LOG_RETURNED", entityType: "JobsiteLog", entityId: id,
    after: { returnNotes: input.returnNotes },
  });

  const creatorId = existing.createdBy;
  if (creatorId && creatorId !== ctx.actorUserId) {
    try {
      const notes = input.returnNotes?.trim();
      await createSystemNotification({
        tenantId: ctx.tenantId,
        companyId: existing.companyId,
        recipientUserId: creatorId,
        type: "JOBSITE_LOG_RETURNED",
        title: "Parte devuelto para corrección",
        body: notes
          ? `Motivo: ${notes.length > 500 ? `${notes.slice(0, 500)}…` : notes}`
          : "Un supervisor devolvió el parte a borrador.",
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
    tenantId: ctx.tenantId, actorUserId: ctx.actorUserId,
    action: "JOBSITE_LOG_CANCELLED", entityType: "JobsiteLog", entityId: id, after: { status: "CANCELLED" },
  });
  return serializeLog(updated);
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

export async function listProjectWbsItemsForLog(projectId: string, ctx: ServiceContext) {
  await assertJobsiteLogTenantModule(ctx);
  if (!canViewJobsiteLogArea(ctx.roles)) throw new ServiceError("FORBIDDEN", "Sin permisos");
  return prisma.wbsNode.findMany({
    where: { type: "ITEM", budget: { projectId, status: { in: ["APPROVED", "CLOSED"] } } },
    select: { id: true, code: true, name: true, costItem: { select: { unit: true } } },
    orderBy: { code: "asc" },
  });
}
