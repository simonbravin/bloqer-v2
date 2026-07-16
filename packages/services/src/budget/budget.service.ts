import { prisma, Prisma } from "@bloqer/database";
import type { Budget, BudgetSettings } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type { CreateBudgetInput, UpdateBudgetInput } from "@bloqer/validators";
import { listEntityAuditLogs, log } from "../audit/audit.service";
import { ServiceContext, ServiceError } from "../types";

import { canViewBudgetsArea } from "../project/project-nav-guards";
import { assertProjectAllowsBudgetPlanning } from "../project/project-operational-guard";

export { canViewBudgetsArea };

// ─── Guards ───────────────────────────────────────────────────────────────────

export function assertBudgetEditable(budget: Budget): void {
  if (budget.status !== "DRAFT" && budget.status !== "RETURNED_FOR_CHANGES") {
    throw new ServiceError(
      "CONFLICT",
      `El presupuesto en estado "${budget.status}" no permite cambios económicos`,
    );
  }
}

/** Presupuesto usado como base del cronograma del proyecto (BR-SCH / línea base WBS). */
export async function isBudgetScheduleBaseline(
  budgetId: string,
  tenantId: string,
): Promise<boolean> {
  const count = await prisma.schedule.count({
    where: { baselineBudgetId: budgetId, tenantId },
  });
  return count > 0;
}

/** WBS: estado editable y no bloqueado por cronograma. */
export async function assertBudgetWbsStructureMutable(
  budget: Budget,
  ctx: ServiceContext,
): Promise<void> {
  assertBudgetEditable(budget);
  if (await isBudgetScheduleBaseline(budget.id, ctx.tenantId)) {
    throw new ServiceError(
      "CONFLICT",
      "Este presupuesto es la base del cronograma. No se puede modificar la estructura WBS.",
    );
  }
}

export type BudgetWithSettings = Budget & { settings: BudgetSettings | null };

export type BudgetLifecycleInput = { comment?: string };

export type BudgetLifecycleLogEntry = {
  id: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  comment: string | null;
  actorUserId: string | null;
  actorName: string | null;
  createdAt: Date;
};

const BUDGET_LIFECYCLE_ACTIONS = [
  "budget.created",
  "budget.submitted_for_review",
  "budget.returned_for_changes",
  "budget.approved",
  "budget.closed",
  "budget.cancelled",
] as const;

function parseAuditStatus(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const status = (json as { status?: unknown }).status;
  return typeof status === "string" ? status : null;
}

function parseAuditComment(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const comment = (json as { comment?: unknown }).comment;
  return typeof comment === "string" && comment.trim() ? comment.trim() : null;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getBudgetById(id: string, ctx: ServiceContext): Promise<BudgetWithSettings> {
  if (!canViewBudgetsArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions to view budgets");
  }
  const budget = await prisma.budget.findUnique({
    where: { id },
    include: { settings: true },
  });
  if (!budget) throw new ServiceError("NOT_FOUND", "Presupuesto no encontrado");
  if (budget.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  return budget;
}

export async function listBudgetsByProject(
  projectId: string,
  ctx: ServiceContext,
): Promise<BudgetWithSettings[]> {
  if (!canViewBudgetsArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions to view budgets");
  }
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  return prisma.budget.findMany({
    where: { projectId, tenantId: ctx.tenantId },
    include: { settings: true },
    orderBy: { versionNumber: "asc" },
  });
}

export async function getBudgetLifecycleLog(
  budgetId: string,
  ctx: ServiceContext,
): Promise<BudgetLifecycleLogEntry[]> {
  if (!canViewBudgetsArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions to view budgets");
  }
  const budget = await prisma.budget.findUnique({ where: { id: budgetId } });
  if (!budget) throw new ServiceError("NOT_FOUND", "Presupuesto no encontrado");
  if (budget.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const rows = await listEntityAuditLogs(
    ctx.tenantId,
    "Budget",
    budgetId,
    [...BUDGET_LIFECYCLE_ACTIONS],
  );

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    fromStatus: parseAuditStatus(row.before),
    toStatus: parseAuditStatus(row.after),
    comment: parseAuditComment(row.after),
    actorUserId: row.actorUserId,
    actorName: row.actor?.name ?? row.actor?.email ?? null,
    createdAt: row.createdAt,
  }));
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createBudget(
  input: CreateBudgetInput,
  ctx: ServiceContext,
): Promise<BudgetWithSettings> {
  if (!can(ctx.roles, "EDIT", "BUDGETS")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions to create budgets");
  }
  const project = await assertProjectAllowsBudgetPlanning(input.projectId, ctx.tenantId);

  const maxVersion = await prisma.budget.aggregate({
    where: { projectId: input.projectId },
    _max: { versionNumber: true },
  });
  const versionNumber = (maxVersion._max.versionNumber ?? 0) + 1;

  const { name, currency, internalNotes, projectId, overheadPct, financialCostPct, financialDaysAvg, profitPct, taxPct } = input;

  const budget = await prisma.$transaction(async (tx) => {
    const b = await tx.budget.create({
      data: {
        tenantId: ctx.tenantId,
        companyId: ctx.companyId ?? undefined,
        projectId,
        versionNumber,
        name,
        currency: currency ?? project.country === "AR" ? "ARS" : "USD",
        internalNotes,
        createdBy: ctx.actorUserId,
        updatedBy: ctx.actorUserId,
      },
    });
    await tx.budgetSettings.create({
      data: {
        budgetId: b.id,
        overheadPct: overheadPct ?? 0,
        financialCostPct: financialCostPct ?? 0,
        financialDaysAvg: financialDaysAvg ?? 0,
        profitPct: profitPct ?? 0,
        taxPct: taxPct ?? 0,
      },
    });
    return tx.budget.findUniqueOrThrow({ where: { id: b.id }, include: { settings: true } });
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "budget.created",
    entityType: "Budget",
    entityId: budget.id,
    after: { status: "DRAFT", name, versionNumber, projectId },
    ipAddress: ctx.ipAddress,
  });

  return budget;
}

export async function updateBudget(
  id: string,
  input: UpdateBudgetInput,
  ctx: ServiceContext,
): Promise<Budget> {
  if (!can(ctx.roles, "EDIT", "BUDGETS")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions");
  }
  const existing = await prisma.budget.findUnique({ where: { id } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Presupuesto no encontrado");
  if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  await assertProjectAllowsBudgetPlanning(existing.projectId, ctx.tenantId);
  // name/internalNotes allowed in any non-CANCELLED status
  if (existing.status === "CANCELLED") throw new ServiceError("CONFLICT", "No se puede editar un presupuesto cancelado");

  const updated = await prisma.budget.update({
    where: { id },
    data: { ...input, updatedBy: ctx.actorUserId },
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "budget.updated",
    entityType: "Budget",
    entityId: id,
    before: { name: existing.name },
    after: { name: updated.name },
    ipAddress: ctx.ipAddress,
  });

  return updated;
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

export async function submitBudgetForReview(
  id: string,
  ctx: ServiceContext,
  input?: BudgetLifecycleInput,
): Promise<Budget> {
  return _transition(id, ctx, ["DRAFT", "RETURNED_FOR_CHANGES"], "IN_REVIEW", "budget.submitted_for_review", input);
}

export async function returnBudgetForChanges(
  id: string,
  ctx: ServiceContext,
  input?: BudgetLifecycleInput,
): Promise<Budget> {
  const comment = input?.comment?.trim();
  if (!comment) {
    throw new ServiceError("VALIDATION", "Las observaciones son obligatorias para devolver el presupuesto");
  }
  return _transition(
    id,
    ctx,
    ["IN_REVIEW"],
    "RETURNED_FOR_CHANGES",
    "budget.returned_for_changes",
    { comment },
  );
}

export async function approveBudget(
  id: string,
  ctx: ServiceContext,
  input?: BudgetLifecycleInput,
): Promise<Budget> {
  if (!can(ctx.roles, "APPROVE", "BUDGETS")) {
    throw new ServiceError("FORBIDDEN", "Se requiere permiso de aprobación");
  }
  const budget = await prisma.budget.findUnique({ where: { id } });
  if (!budget) throw new ServiceError("NOT_FOUND", "Presupuesto no encontrado");
  if (budget.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (budget.status !== "IN_REVIEW") {
    throw new ServiceError("CONFLICT", "Solo se puede aprobar un presupuesto en revisión");
  }

  // BR-BUD-001: one APPROVED per project (service check + partial unique index in DB).
  const existing = await prisma.budget.findFirst({
    where: { projectId: budget.projectId, status: "APPROVED", id: { not: id } },
  });
  if (existing) {
    throw new ServiceError(
      "CONFLICT",
      "Ya existe un presupuesto aprobado para este proyecto. Ciérrelo antes de aprobar otro.",
    );
  }

  let updated: Budget;
  try {
    updated = await prisma.budget.update({
      where: { id },
      data: { status: "APPROVED", updatedBy: ctx.actorUserId },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ServiceError(
        "CONFLICT",
        "Ya existe un presupuesto aprobado para este proyecto. Ciérrelo antes de aprobar otro.",
      );
    }
    throw e;
  }

  const comment = input?.comment?.trim() || null;
  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "budget.approved",
    entityType: "Budget",
    entityId: id,
    before: { status: "IN_REVIEW" },
    after: { status: "APPROVED", ...(comment ? { comment } : {}) },
    ipAddress: ctx.ipAddress,
  });

  return updated;
}

export async function closeBudget(
  id: string,
  ctx: ServiceContext,
  input?: BudgetLifecycleInput,
): Promise<Budget> {
  if (!can(ctx.roles, "APPROVE", "BUDGETS")) {
    throw new ServiceError("FORBIDDEN", "Se requiere permiso de aprobación");
  }
  return _transition(id, ctx, ["APPROVED"], "CLOSED", "budget.closed", input);
}

export async function cancelBudget(
  id: string,
  ctx: ServiceContext,
  input?: BudgetLifecycleInput,
): Promise<Budget> {
  return _transition(
    id,
    ctx,
    ["DRAFT", "IN_REVIEW", "RETURNED_FOR_CHANGES"],
    "CANCELLED",
    "budget.cancelled",
    input,
  );
}

// ─── Internal ────────────────────────────────────────────────────────────────

async function _transition(
  id: string,
  ctx: ServiceContext,
  allowedFrom: Budget["status"][],
  to: Budget["status"],
  action: string,
  input?: BudgetLifecycleInput,
): Promise<Budget> {
  if (!can(ctx.roles, "EDIT", "BUDGETS")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions");
  }
  const budget = await prisma.budget.findUnique({ where: { id } });
  if (!budget) throw new ServiceError("NOT_FOUND", "Presupuesto no encontrado");
  if (budget.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  await assertProjectAllowsBudgetPlanning(budget.projectId, ctx.tenantId);
  if (!allowedFrom.includes(budget.status)) {
    throw new ServiceError("CONFLICT", `No se puede cambiar el estado desde "${budget.status}"`);
  }

  const comment = input?.comment?.trim() || null;

  const updated = await prisma.budget.update({
    where: { id },
    data: { status: to, updatedBy: ctx.actorUserId },
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action,
    entityType: "Budget",
    entityId: id,
    before: { status: budget.status },
    after: { status: to, ...(comment ? { comment } : {}) },
    ipAddress: ctx.ipAddress,
  });

  return updated;
}
