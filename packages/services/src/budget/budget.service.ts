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

type BudgetEditabilityClient = {
  tenant: {
    findUnique: (args: {
      where: { id: string };
      select: { allowApprovedBudgetEconomicEdits: true };
    }) => Promise<{ allowApprovedBudgetEconomicEdits: boolean } | null>;
  };
  project: {
    findUnique: (args: {
      where: { id: string };
      select: { allowApprovedBudgetEconomicEdits: true; tenantId: true };
    }) => Promise<{ allowApprovedBudgetEconomicEdits: boolean; tenantId: string } | null>;
  };
};

/**
 * Economic edits: DRAFT / RETURNED_FOR_CHANGES always;
 * APPROVED only when tenant kill-switch AND project flag are ON ([D-088]);
 * CLOSED never.
 */
export async function assertBudgetEditable(
  budget: Budget,
  client: BudgetEditabilityClient = prisma,
): Promise<void> {
  if (budget.status === "DRAFT" || budget.status === "RETURNED_FOR_CHANGES") {
    return;
  }
  if (budget.status === "CLOSED") {
    throw new ServiceError(
      "CONFLICT",
      'El presupuesto cerrado no permite cambios económicos. Usá una adenda ([BR-BUD-002]).',
    );
  }
  if (budget.status !== "APPROVED") {
    throw new ServiceError(
      "CONFLICT",
      `El presupuesto en estado "${budget.status}" no permite cambios económicos`,
    );
  }

  const tenant = await client.tenant.findUnique({
    where: { id: budget.tenantId },
    select: { allowApprovedBudgetEconomicEdits: true },
  });
  if (!tenant?.allowApprovedBudgetEconomicEdits) {
    throw new ServiceError(
      "CONFLICT",
      "La edición de presupuestos aprobados está deshabilitada en la organización ([D-088])",
    );
  }

  const project = await client.project.findUnique({
    where: { id: budget.projectId },
    select: { allowApprovedBudgetEconomicEdits: true, tenantId: true },
  });
  if (!project || project.tenantId !== budget.tenantId) {
    throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  }
  if (!project.allowApprovedBudgetEconomicEdits) {
    throw new ServiceError(
      "CONFLICT",
      "La edición de presupuestos aprobados no está habilitada para esta obra ([D-088])",
    );
  }
}

type BudgetLockTx = BudgetEditabilityClient & {
  $queryRaw: typeof prisma.$queryRaw;
  budget: { findUniqueOrThrow: typeof prisma.budget.findUniqueOrThrow };
};

/**
 * Lock budget row and re-assert editable status inside a write txn
 * so concurrent submit/approve cannot race APU/qty edits.
 */
export async function lockBudgetForEconomicEdit(
  tx: BudgetLockTx,
  budgetId: string,
  tenantId: string,
): Promise<Budget> {
  await tx.$queryRaw`SELECT id FROM budgets WHERE id = ${budgetId} FOR UPDATE`;
  const budget = await tx.budget.findUniqueOrThrow({ where: { id: budgetId } });
  if (budget.tenantId !== tenantId) {
    throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  }
  await assertBudgetEditable(budget, tx);
  return budget;
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

/**
 * Whether economic edits are allowed for this budget under current status + D-088 flags.
 * Used by UI (banner / editable); service mutations still go through assertBudgetEditable.
 */
export async function resolveBudgetEconomicEditability(
  budget: Pick<Budget, "id" | "status" | "tenantId" | "projectId">,
): Promise<{ editable: boolean; approvedOverrideActive: boolean }> {
  if (budget.status === "DRAFT" || budget.status === "RETURNED_FOR_CHANGES") {
    return { editable: true, approvedOverrideActive: false };
  }
  if (budget.status !== "APPROVED") {
    return { editable: false, approvedOverrideActive: false };
  }
  const [tenant, project] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: budget.tenantId },
      select: { allowApprovedBudgetEconomicEdits: true },
    }),
    prisma.project.findUnique({
      where: { id: budget.projectId },
      select: { allowApprovedBudgetEconomicEdits: true, tenantId: true },
    }),
  ]);
  const approvedOverrideActive = Boolean(
    tenant?.allowApprovedBudgetEconomicEdits &&
      project?.allowApprovedBudgetEconomicEdits &&
      project.tenantId === budget.tenantId,
  );
  return { editable: approvedOverrideActive, approvedOverrideActive };
}

/** OWNER / ADMIN may toggle D-088 policy flags. */
export function canManageApprovedBudgetEditPolicy(roles: ServiceContext["roles"]): boolean {
  return roles.some((r) => r === "OWNER" || r === "ADMIN");
}

/** WBS: estado editable y no bloqueado por cronograma. */
export async function assertBudgetWbsStructureMutable(
  budget: Budget,
  ctx: ServiceContext,
): Promise<void> {
  await assertBudgetEditable(budget);
  if (await isBudgetScheduleBaseline(budget.id, ctx.tenantId)) {
    throw new ServiceError(
      "CONFLICT",
      "Este presupuesto es la base del cronograma. No se puede modificar la estructura EDT.",
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
  "budget.addendum_added",
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

  const { name, currency, internalNotes, projectId, parentBudgetId, overheadPct, financialCostPct, financialDaysAvg, profitPct, taxPct } = input;

  let resolvedParentId: string | null = null;
  let parentSettingsDefaults: {
    overheadPct: number;
    financialCostPct: number;
    financialDaysAvg: number;
    profitPct: number;
    taxPct: number;
  } | null = null;
  if (parentBudgetId) {
    const parent = await prisma.budget.findFirst({
      where: { id: parentBudgetId, tenantId: ctx.tenantId, projectId },
      select: {
        id: true,
        status: true,
        settings: {
          select: {
            overheadPct: true,
            financialCostPct: true,
            financialDaysAvg: true,
            profitPct: true,
            taxPct: true,
          },
        },
      },
    });
    if (!parent) {
      throw new ServiceError("NOT_FOUND", "Presupuesto padre no encontrado en este proyecto");
    }
    if (parent.status !== "APPROVED" && parent.status !== "CLOSED") {
      throw new ServiceError(
        "CONFLICT",
        "La adenda/fase debe apuntar a un presupuesto APPROVED o CLOSED ([D-002])",
      );
    }
    resolvedParentId = parent.id;
    if (parent.settings) {
      parentSettingsDefaults = {
        overheadPct: Number(parent.settings.overheadPct),
        financialCostPct: Number(parent.settings.financialCostPct),
        financialDaysAvg: Number(parent.settings.financialDaysAvg),
        profitPct: Number(parent.settings.profitPct),
        taxPct: Number(parent.settings.taxPct),
      };
    }
  }

  const resolvedOverhead = overheadPct ?? parentSettingsDefaults?.overheadPct ?? 0;
  const resolvedFinancialCost =
    financialCostPct ?? parentSettingsDefaults?.financialCostPct ?? 0;
  const resolvedFinancialDays =
    financialDaysAvg ?? parentSettingsDefaults?.financialDaysAvg ?? 0;
  const resolvedProfit = profitPct ?? parentSettingsDefaults?.profitPct ?? 0;
  const resolvedTax = taxPct ?? parentSettingsDefaults?.taxPct ?? 0;

  let budget: BudgetWithSettings;
  try {
    budget = await prisma.$transaction(async (tx) => {
      const maxVersion = await tx.budget.aggregate({
        where: { projectId },
        _max: { versionNumber: true },
      });
      const versionNumber = (maxVersion._max.versionNumber ?? 0) + 1;

      const b = await tx.budget.create({
        data: {
          tenantId: ctx.tenantId,
          companyId: ctx.companyId ?? undefined,
          projectId,
          parentBudgetId: resolvedParentId,
          versionNumber,
          name,
          currency: currency ?? (project.country === "AR" ? "ARS" : "USD"),
          internalNotes,
          createdBy: ctx.actorUserId,
          updatedBy: ctx.actorUserId,
        },
      });
      await tx.budgetSettings.create({
        data: {
          budgetId: b.id,
          overheadPct: resolvedOverhead,
          financialCostPct: resolvedFinancialCost,
          financialDaysAvg: resolvedFinancialDays,
          profitPct: resolvedProfit,
          taxPct: resolvedTax,
        },
      });
      return tx.budget.findUniqueOrThrow({ where: { id: b.id }, include: { settings: true } });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ServiceError(
        "CONFLICT",
        "No se pudo asignar el número de versión. Intentá de nuevo.",
      );
    }
    throw e;
  }

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: resolvedParentId ? "budget.addendum_added" : "budget.created",
    entityType: "Budget",
    entityId: budget.id,
    after: {
      status: "DRAFT",
      name,
      versionNumber: budget.versionNumber,
      projectId,
      ...(resolvedParentId ? { parentBudgetId: resolvedParentId } : {}),
    },
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
  if (existing.status === "CANCELLED") {
    throw new ServiceError("CONFLICT", "No se puede editar un presupuesto cancelado");
  }
  // BR-BUD-008: CLOSED only allows whitelist metadata (internalNotes among updateBudget fields).
  if (existing.status === "CLOSED" && input.name !== undefined) {
    throw new ServiceError(
      "CONFLICT",
      "Presupuesto cerrado: el nombre no se puede cambiar. Usá adenda (budget hijo) para cambios contractuales.",
    );
  }

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

/** Unique `budgets_one_approved_per_project_key` must surface as CONFLICT, never 500. */
export function rethrowIfBudgetApproveUniqueConflict(err: unknown): void {
  if (err instanceof ServiceError) throw err;
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    throw new ServiceError(
      "CONFLICT",
      "Ya existe un presupuesto aprobado para este proyecto. Ciérrelo antes de aprobar otro.",
    );
  }
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
  await assertProjectAllowsBudgetPlanning(budget.projectId, ctx.tenantId);

  // BR-BUD-005: every CostItem must have at least one CostAnalysisLine (APU).
  const itemsWithoutApu = await prisma.costItem.findMany({
    where: {
      budgetId: id,
      analysisLines: { none: {} },
    },
    select: {
      id: true,
      wbsNode: { select: { code: true, name: true } },
    },
    take: 20,
  });
  if (itemsWithoutApu.length > 0) {
    const sample = itemsWithoutApu
      .map((i) => i.wbsNode?.code ?? i.id.slice(0, 8))
      .join(", ");
    throw new ServiceError(
      "CONFLICT",
      `No se puede aprobar: hay ítems sin análisis de costos (APU). Ej.: ${sample}`,
    );
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
    const result = await prisma.budget.updateMany({
      where: { id, tenantId: ctx.tenantId, status: "IN_REVIEW" },
      data: {
        status: "APPROVED",
        updatedBy: ctx.actorUserId,
        approvedSnapshotTotalCost: budget.totalCost,
        approvedSnapshotTotalSalePrice: budget.totalSalePrice,
      },
    });
    if (result.count === 0) {
      throw new ServiceError(
        "CONFLICT",
        "El presupuesto ya no está en revisión. Recargá e intentá de nuevo.",
      );
    }
    updated = await prisma.budget.findUniqueOrThrow({ where: { id } });
  } catch (e) {
    rethrowIfBudgetApproveUniqueConflict(e);
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

  const result = await prisma.budget.updateMany({
    where: { id, tenantId: ctx.tenantId, status: { in: allowedFrom } },
    data: { status: to, updatedBy: ctx.actorUserId },
  });
  if (result.count === 0) {
    throw new ServiceError(
      "CONFLICT",
      `No se puede cambiar el estado desde "${budget.status}". Recargá e intentá de nuevo.`,
    );
  }
  const updated = await prisma.budget.findUniqueOrThrow({ where: { id } });

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
