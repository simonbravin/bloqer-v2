import { prisma } from "@bloqer/database";
import type { Budget, BudgetSettings } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type { CreateBudgetInput, UpdateBudgetInput } from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { ServiceContext, ServiceError } from "../types";

/** Matches document.service listEntityDocuments for `BUDGET` — VIEW BUDGETS | VIEW PROJECTS. */
export function canViewBudgetsArea(roles: ServiceContext["roles"]): boolean {
  return can(roles, "VIEW", "BUDGETS") || can(roles, "VIEW", "PROJECTS");
}

// ─── Guards ───────────────────────────────────────────────────────────────────

export function assertBudgetEditable(budget: Budget): void {
  if (budget.status !== "DRAFT" && budget.status !== "RETURNED_FOR_CHANGES") {
    throw new ServiceError(
      "CONFLICT",
      `El presupuesto en estado "${budget.status}" no permite cambios económicos`,
    );
  }
}

export type BudgetWithSettings = Budget & { settings: BudgetSettings | null };

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

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createBudget(
  input: CreateBudgetInput,
  ctx: ServiceContext,
): Promise<BudgetWithSettings> {
  if (!can(ctx.roles, "EDIT", "BUDGETS")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions to create budgets");
  }
  const project = await prisma.project.findUnique({ where: { id: input.projectId } });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

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
    after: { name, versionNumber, projectId },
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

export async function submitBudgetForReview(id: string, ctx: ServiceContext): Promise<Budget> {
  return _transition(id, ctx, ["DRAFT", "RETURNED_FOR_CHANGES"], "IN_REVIEW", "budget.submitted_for_review");
}

export async function returnBudgetForChanges(id: string, ctx: ServiceContext): Promise<Budget> {
  return _transition(id, ctx, ["IN_REVIEW"], "RETURNED_FOR_CHANGES", "budget.returned_for_changes");
}

export async function approveBudget(id: string, ctx: ServiceContext): Promise<Budget> {
  if (!can(ctx.roles, "APPROVE", "BUDGETS")) {
    throw new ServiceError("FORBIDDEN", "Se requiere permiso de aprobación");
  }
  const budget = await prisma.budget.findUnique({ where: { id } });
  if (!budget) throw new ServiceError("NOT_FOUND", "Presupuesto no encontrado");
  if (budget.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (budget.status !== "IN_REVIEW") {
    throw new ServiceError("CONFLICT", "Solo se puede aprobar un presupuesto en revisión");
  }

  // BR-BUD-001: enforce one APPROVED per project at service layer
  // TODO: add DB-level protection (partial unique index not supported in Prisma)
  const existing = await prisma.budget.findFirst({
    where: { projectId: budget.projectId, status: "APPROVED", id: { not: id } },
  });
  if (existing) {
    throw new ServiceError(
      "CONFLICT",
      "Ya existe un presupuesto aprobado para este proyecto. Ciérrelo antes de aprobar otro.",
    );
  }

  const updated = await prisma.budget.update({
    where: { id },
    data: { status: "APPROVED", updatedBy: ctx.actorUserId },
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "budget.approved",
    entityType: "Budget",
    entityId: id,
    before: { status: "IN_REVIEW" },
    after: { status: "APPROVED" },
    ipAddress: ctx.ipAddress,
  });

  return updated;
}

export async function closeBudget(id: string, ctx: ServiceContext): Promise<Budget> {
  if (!can(ctx.roles, "APPROVE", "BUDGETS")) {
    throw new ServiceError("FORBIDDEN", "Se requiere permiso de aprobación");
  }
  return _transition(id, ctx, ["APPROVED"], "CLOSED", "budget.closed");
}

export async function cancelBudget(id: string, ctx: ServiceContext): Promise<Budget> {
  return _transition(
    id,
    ctx,
    ["DRAFT", "IN_REVIEW", "RETURNED_FOR_CHANGES"],
    "CANCELLED",
    "budget.cancelled",
  );
}

// ─── Internal ────────────────────────────────────────────────────────────────

async function _transition(
  id: string,
  ctx: ServiceContext,
  allowedFrom: Budget["status"][],
  to: Budget["status"],
  action: string,
): Promise<Budget> {
  if (!can(ctx.roles, "EDIT", "BUDGETS")) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions");
  }
  const budget = await prisma.budget.findUnique({ where: { id } });
  if (!budget) throw new ServiceError("NOT_FOUND", "Presupuesto no encontrado");
  if (budget.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (!allowedFrom.includes(budget.status)) {
    throw new ServiceError("CONFLICT", `No se puede cambiar el estado desde "${budget.status}"`);
  }

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
    after: { status: to },
    ipAddress: ctx.ipAddress,
  });

  return updated;
}
