import { prisma, Prisma } from "@bloqer/database";
import type { Budget, BudgetSettings } from "@bloqer/database";
import { can } from "@bloqer/domain";
import type { CreateBudgetInput, UpdateBudgetInput } from "@bloqer/validators";
import { listEntityAuditLogs, log } from "../audit/audit.service";
import { ServiceContext, ServiceError } from "../types";

import { canViewBudgetsArea } from "../project/project-nav-guards";
import { assertProjectAllowsBudgetPlanning, lockProjectForBudgetPlanning } from "../project/project-operational-guard";
import { requireProjectAccess, requireProjectAccessIfPresent } from "../security/access";
import { resolveDefaultCompanyIdForTenant } from "../company/company.service";
import { companyScopeFilter, isCrossCompany } from "../company-scope";
import { assertTenantModuleEnabled } from "../tenant-modules/tenant-module.service";

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
 * Economic + WBS edits: DRAFT / RETURNED_FOR_CHANGES always;
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

/**
 * Serialize policy revocation, project lifecycle and budget lifecycle with edits.
 * Always acquire Tenant SHARE -> Project NO KEY UPDATE -> Budget UPDATE; callers
 * must authorize project access before starting the transaction and must not
 * acquire a project/document lock before this helper. SHARE keeps the tenant
 * kill-switch stable while still allowing the audit row's FK KEY SHARE check.
 */
export async function lockBudgetForEconomicEdit(
  tx: Prisma.TransactionClient,
  budgetId: string,
  ctx: ServiceContext,
): Promise<Budget> {
  await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${ctx.tenantId} FOR SHARE`;
  const preview = await tx.budget.findFirst({ where: { id: budgetId, tenantId: ctx.tenantId } });
  if (!preview) throw new ServiceError("NOT_FOUND", "Presupuesto no encontrado");
  if (isCrossCompany(preview.companyId, ctx)) throw new ServiceError("FORBIDDEN", "Presupuesto de otra empresa");
  await lockProjectForBudgetPlanning(tx, preview.projectId, ctx);
  await tx.$queryRaw`SELECT id FROM budgets WHERE id = ${budgetId} AND "tenantId" = ${ctx.tenantId} FOR UPDATE`;
  const budget = await tx.budget.findUniqueOrThrow({ where: { id: budgetId } });
  if (budget.tenantId !== ctx.tenantId) {
    throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  }
  if (isCrossCompany(budget.companyId, ctx)) throw new ServiceError("FORBIDDEN", "Presupuesto de otra empresa");
  await assertBudgetEditable(budget, tx);
  return budget;
}

/** Presupuesto usado como base del cronograma del proyecto (BR-SCH / línea base WBS). */
export async function isBudgetScheduleBaseline(
  budgetId: string,
  tenantId: string,
  client: Pick<Prisma.TransactionClient, "schedule"> = prisma,
): Promise<boolean> {
  const count = await client.schedule.count({
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

/** Audit `after` marker when an economic mutation runs on APPROVED ([D-088]). */
export function approvedEditOverrideAuditMeta(
  status: Budget["status"],
): { approvedEditOverride?: true } {
  return status === "APPROVED" ? { approvedEditOverride: true } : {};
}

/**
 * WBS structure (add/remove/reorder/import items).
 * DRAFT / RETURNED_FOR_CHANGES: blocked if this budget is the schedule baseline.
 * APPROVED: D-088 override already required by assertBudgetEditable — full
 * structure edits allowed even when the budget is the schedule baseline.
 */
export async function assertBudgetWbsStructureMutable(
  budget: Budget,
  ctx: ServiceContext,
  client: BudgetEditabilityClient & Pick<Prisma.TransactionClient, "schedule"> = prisma,
): Promise<void> {
  await assertBudgetEditable(budget, client);
  if (budget.status === "APPROVED") {
    return;
  }
  if (await isBudgetScheduleBaseline(budget.id, ctx.tenantId, client)) {
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
  await assertTenantModuleEnabled(ctx, "BUDGETS");
  const budget = await prisma.budget.findUnique({
    where: { id },
    include: { settings: true },
  });
  if (!budget) throw new ServiceError("NOT_FOUND", "Presupuesto no encontrado");
  if (budget.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (isCrossCompany(budget.companyId, ctx)) throw new ServiceError("FORBIDDEN", "Presupuesto de otra empresa");
  await requireProjectAccessIfPresent(budget.projectId, ctx);
  return budget;
}

export async function listBudgetsByProject(
  projectId: string,
  ctx: ServiceContext,
): Promise<BudgetWithSettings[]> {
  if (!canViewBudgetsArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Insufficient permissions to view budgets");
  }
  await assertTenantModuleEnabled(ctx, "BUDGETS");
  await requireProjectAccess(projectId, ctx);

  return prisma.budget.findMany({
    where: { projectId, tenantId: ctx.tenantId, ...companyScopeFilter(ctx) },
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
  await assertTenantModuleEnabled(ctx, "BUDGETS");
  const budget = await prisma.budget.findUnique({ where: { id: budgetId } });
  if (!budget) throw new ServiceError("NOT_FOUND", "Presupuesto no encontrado");
  if (budget.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (isCrossCompany(budget.companyId, ctx)) throw new ServiceError("FORBIDDEN", "Presupuesto de otra empresa");
  await requireProjectAccess(budget.projectId, ctx);

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
  await assertTenantModuleEnabled(ctx, "BUDGETS");
  await assertProjectAllowsBudgetPlanning(input.projectId, ctx);

  const { name, currency, internalNotes, projectId, parentBudgetId, overheadPct, financialCostPct, financialDaysAvg, profitPct, taxPct } = input;

  let budget: BudgetWithSettings;
  try {
    budget = await prisma.$transaction(async (tx) => {
      const project = await lockProjectForBudgetPlanning(tx, projectId, ctx);
      // The project lock also serializes parent lifecycle/settings writers.
      const parent = parentBudgetId ? await tx.budget.findFirst({
        where: { id: parentBudgetId, tenantId: ctx.tenantId, projectId, ...companyScopeFilter(ctx) },
        include: { settings: true },
      }) : null;
      if (parentBudgetId && !parent) {
        throw new ServiceError("NOT_FOUND", "Presupuesto padre no encontrado en este proyecto");
      }
      if (parent && parent.status !== "APPROVED" && parent.status !== "CLOSED") {
        throw new ServiceError("CONFLICT", "La adenda/fase debe apuntar a un presupuesto APPROVED o CLOSED ([D-002])");
      }
      const companyId = await resolveDefaultCompanyIdForTenant(
        ctx.tenantId, project.companyId ?? ctx.companyId, tx,
      );
      const maxVersion = await tx.budget.aggregate({
        where: { projectId, tenantId: ctx.tenantId },
        _max: { versionNumber: true },
      });
      const versionNumber = (maxVersion._max.versionNumber ?? 0) + 1;

      const b = await tx.budget.create({
        data: {
          tenantId: ctx.tenantId,
          companyId,
          projectId,
          parentBudgetId: parent?.id ?? null,
          versionNumber,
          name,
          currency: currency ?? parent?.currency ?? (project.country === "AR" ? "ARS" : "USD"),
          internalNotes,
          createdBy: ctx.actorUserId,
          updatedBy: ctx.actorUserId,
        },
      });
      await tx.budgetSettings.create({
        data: {
          budgetId: b.id,
          overheadPct: overheadPct ?? parent?.settings?.overheadPct ?? 0,
          financialCostPct: financialCostPct ?? parent?.settings?.financialCostPct ?? 0,
          financialDaysAvg: financialDaysAvg ?? parent?.settings?.financialDaysAvg ?? 0,
          profitPct: profitPct ?? parent?.settings?.profitPct ?? 0,
          taxPct: taxPct ?? parent?.settings?.taxPct ?? 0,
        },
      });
      const created = await tx.budget.findUniqueOrThrow({ where: { id: b.id }, include: { settings: true } });
      await log({
        tenantId: ctx.tenantId, actorUserId: ctx.actorUserId, projectId, companyId: companyId ?? undefined,
        action: parent ? "budget.addendum_added" : "budget.created",
        entityType: "Budget", entityId: created.id,
        after: {
          status: "DRAFT", name, versionNumber: created.versionNumber, projectId,
          ...(parent ? { parentBudgetId: parent.id } : {}),
        },
        ipAddress: ctx.ipAddress,
      }, tx);
      return created;
    }, { maxWait: 10_000, timeout: 30_000 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ServiceError(
        "CONFLICT",
        "No se pudo asignar el número de versión. Intentá de nuevo.",
      );
    }
    throw e;
  }

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
  await assertTenantModuleEnabled(ctx, "BUDGETS");
  const existing = await prisma.budget.findUnique({ where: { id } });
  if (!existing) throw new ServiceError("NOT_FOUND", "Presupuesto no encontrado");
  if (existing.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (isCrossCompany(existing.companyId, ctx)) throw new ServiceError("FORBIDDEN", "Presupuesto de otra empresa");
  await assertProjectAllowsBudgetPlanning(existing.projectId, ctx);
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

  return prisma.$transaction(async (tx) => {
    await lockProjectForBudgetPlanning(tx, existing.projectId, ctx);
    await tx.$queryRaw`SELECT id FROM budgets WHERE id = ${id} AND "tenantId" = ${ctx.tenantId} FOR UPDATE`;
    const current = await tx.budget.findUniqueOrThrow({ where: { id } });
    if (current.status === "CANCELLED") {
      throw new ServiceError("CONFLICT", "No se puede editar un presupuesto cancelado");
    }
    if (current.status === "CLOSED" && input.name !== undefined) {
      throw new ServiceError("CONFLICT", "Presupuesto cerrado: el nombre no se puede cambiar. Usá adenda (budget hijo) para cambios contractuales.");
    }
    const updated = await tx.budget.update({ where: { id }, data: { ...input, updatedBy: ctx.actorUserId } });
    await log({
      tenantId: ctx.tenantId, actorUserId: ctx.actorUserId, projectId: existing.projectId,
      companyId: current.companyId ?? undefined,
      action: "budget.updated", entityType: "Budget", entityId: id,
      before: { name: current.name, internalNotes: current.internalNotes },
      after: { name: updated.name, internalNotes: updated.internalNotes }, ipAddress: ctx.ipAddress,
    }, tx);
    return updated;
  }, { maxWait: 10_000, timeout: 30_000 });
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

/** Unique principal index must surface as CONFLICT, never 500. */
export function rethrowIfBudgetApproveUniqueConflict(err: unknown): void {
  if (err instanceof ServiceError) throw err;
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    throw new ServiceError(
      "CONFLICT",
      "Ya existe un presupuesto principal aprobado para este proyecto. Cerralo antes de aprobar otro principal, o creá una adenda.",
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
  await assertTenantModuleEnabled(ctx, "BUDGETS");
  const preview = await prisma.budget.findUnique({ where: { id } });
  if (!preview) throw new ServiceError("NOT_FOUND", "Presupuesto no encontrado");
  if (preview.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (isCrossCompany(preview.companyId, ctx)) throw new ServiceError("FORBIDDEN", "Presupuesto de otra empresa");
  if (preview.status !== "IN_REVIEW") {
    throw new ServiceError("CONFLICT", "Solo se puede aprobar un presupuesto en revisión");
  }
  await assertProjectAllowsBudgetPlanning(preview.projectId, ctx);

  try {
    return await prisma.$transaction(async (tx) => {
      await lockProjectForBudgetPlanning(tx, preview.projectId, ctx);
      await tx.$queryRaw`SELECT id FROM budgets WHERE id = ${id} AND "tenantId" = ${ctx.tenantId} FOR UPDATE`;
      const budget = await tx.budget.findUniqueOrThrow({ where: { id } });
      if (budget.status !== "IN_REVIEW") {
        throw new ServiceError("CONFLICT", "El presupuesto ya no está en revisión. Recargá e intentá de nuevo.");
      }

      // BR-BUD-005: every CostItem must have at least one CostAnalysisLine (APU).
      const itemsWithoutApu = await tx.costItem.findMany({
        where: { budgetId: id, analysisLines: { none: {} } },
        select: { id: true, wbsNode: { select: { code: true, name: true } } },
        take: 20,
      });
      if (itemsWithoutApu.length > 0) {
        const sample = itemsWithoutApu.map((i) => i.wbsNode?.code ?? i.id.slice(0, 8)).join(", ");
        throw new ServiceError("CONFLICT", `No se puede aprobar: hay ítems sin análisis de costos (APU). Ej.: ${sample}`);
      }

      // Imported leaves start at quantity 0 and blank unit; those placeholders
      // are editable in DRAFT, but cannot become active contractual items.
      const items = await tx.costItem.findMany({
        where: { budgetId: id },
        select: { quantity: true, unit: true, wbsNode: { select: { code: true } } },
      });
      const incompleteItems = items.filter((item) => item.quantity.lte(0) || !item.unit.trim());
      if (incompleteItems.length > 0) {
        const sample = incompleteItems.slice(0, 20).map((item) => item.wbsNode.code).join(", ");
        throw new ServiceError("CONFLICT", `No se puede aprobar: completá una cantidad mayor a 0 y la unidad de cada partida. Ej.: ${sample}`);
      }

      // BR-BUD-001 / D-116: one APPROVED principal. Addenda may be APPROVED too.
      if (!budget.parentBudgetId) {
        const existingPrincipal = await tx.budget.findFirst({
          where: {
            projectId: budget.projectId, tenantId: ctx.tenantId,
            status: "APPROVED", parentBudgetId: null, id: { not: id },
          },
          select: { id: true },
        });
        if (existingPrincipal) {
          throw new ServiceError(
            "CONFLICT",
            "Ya existe un presupuesto principal aprobado para este proyecto. Cerralo antes de aprobar otro principal, o creá una adenda.",
          );
        }
      } else {
        const parent = await tx.budget.findFirst({
          where: { id: budget.parentBudgetId, tenantId: ctx.tenantId, projectId: budget.projectId },
          select: { status: true },
        });
        if (!parent || (parent.status !== "APPROVED" && parent.status !== "CLOSED")) {
          throw new ServiceError("CONFLICT", "La adenda solo se puede aprobar si el presupuesto padre está aprobado o cerrado.");
        }
      }

      const result = await tx.budget.updateMany({
        where: { id, tenantId: ctx.tenantId, status: "IN_REVIEW" },
        data: {
          status: "APPROVED", updatedBy: ctx.actorUserId,
          approvedSnapshotTotalCost: budget.totalCost,
          approvedSnapshotTotalSalePrice: budget.totalSalePrice,
        },
      });
      if (result.count === 0) {
        throw new ServiceError("CONFLICT", "El presupuesto ya no está en revisión. Recargá e intentá de nuevo.");
      }
      const updated = await tx.budget.findUniqueOrThrow({ where: { id } });
      const comment = input?.comment?.trim() || null;
      await log({
        tenantId: ctx.tenantId, actorUserId: ctx.actorUserId, projectId: budget.projectId,
        companyId: budget.companyId ?? undefined,
        action: "budget.approved", entityType: "Budget", entityId: id,
        before: { status: "IN_REVIEW" }, after: { status: "APPROVED", ...(comment ? { comment } : {}) },
        ipAddress: ctx.ipAddress,
      }, tx);
      return updated;
    }, { maxWait: 10_000, timeout: 30_000 });
  } catch (e) {
    rethrowIfBudgetApproveUniqueConflict(e);
    throw e;
  }
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
  await assertTenantModuleEnabled(ctx, "BUDGETS");
  const budget = await prisma.budget.findUnique({ where: { id } });
  if (!budget) throw new ServiceError("NOT_FOUND", "Presupuesto no encontrado");
  if (budget.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  if (isCrossCompany(budget.companyId, ctx)) throw new ServiceError("FORBIDDEN", "Presupuesto de otra empresa");
  await assertProjectAllowsBudgetPlanning(budget.projectId, ctx);
  if (!allowedFrom.includes(budget.status)) {
    throw new ServiceError("CONFLICT", `No se puede cambiar el estado desde "${budget.status}"`);
  }

  const comment = input?.comment?.trim() || null;

  return prisma.$transaction(async (tx) => {
    await lockProjectForBudgetPlanning(tx, budget.projectId, ctx);
    await tx.$queryRaw`SELECT id FROM budgets WHERE id = ${id} AND "tenantId" = ${ctx.tenantId} FOR UPDATE`;
    const current = await tx.budget.findUniqueOrThrow({ where: { id } });
    if (!allowedFrom.includes(current.status)) {
      throw new ServiceError("CONFLICT", `No se puede cambiar el estado desde "${current.status}"`);
    }
    const result = await tx.budget.updateMany({
      where: { id, tenantId: ctx.tenantId, status: current.status },
      data: { status: to, updatedBy: ctx.actorUserId },
    });
    if (result.count === 0) {
      throw new ServiceError("CONFLICT", `No se puede cambiar el estado desde "${current.status}". Recargá e intentá de nuevo.`);
    }
    const updated = await tx.budget.findUniqueOrThrow({ where: { id } });
    await log({
      tenantId: ctx.tenantId, actorUserId: ctx.actorUserId, projectId: budget.projectId,
      companyId: current.companyId ?? undefined,
      action, entityType: "Budget", entityId: id,
      before: { status: current.status }, after: { status: to, ...(comment ? { comment } : {}) },
      ipAddress: ctx.ipAddress,
    }, tx);
    return updated;
  }, { maxWait: 10_000, timeout: 30_000 });
}
