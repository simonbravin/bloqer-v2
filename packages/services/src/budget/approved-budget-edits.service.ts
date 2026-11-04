/**
 * D-088 — exceptional economic edits on APPROVED budgets.
 * Tenant kill-switch + per-project flag (both default OFF). OWNER/ADMIN only for toggles.
 */

import { prisma } from "@bloqer/database";
import {
  updateTenantApprovedBudgetEditsPolicySchema,
  updateProjectApprovedBudgetEditsPolicySchema,
} from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { ServiceContext, ServiceError } from "../types";
import { canReadTenantConfigArea } from "../tenant-settings/tenant-settings-guards";
import { canViewBudgetsArea } from "../project/project-nav-guards";
import { canManageApprovedBudgetEditPolicy } from "./budget.service";
import { assertTenantModuleEnabled, assertTenantModuleEnabledWithGate, getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import { projectRowIdWhereForScope, requireProjectAccess, resolveAccessibleProjectScope } from "../security/access";
import { assertTenantConfigReadAccess } from "../tenant-settings/tenant-settings-access";
import { lockProjectForMutation } from "../project/project-write-lock";
import { companyScopeFilter } from "../company-scope";

export type ApprovedBudgetEditsPolicyView = {
  tenantAllow: boolean;
  projects: Array<{
    id: string;
    code: string;
    name: string;
    status: string;
    allow: boolean;
    /** True when the project has a Budget in APPROVED (D-088 applies only to APPROVED). */
    hasApprovedBudget: boolean;
    /** Display line for the approved budget, or null. */
    approvedBudgetLabel: string | null;
    /**
     * Human-readable budget situation for the table.
     * Examples: "Aprobado · v1 — Obra base", "Sin presupuesto aprobado", "Sin presupuestos".
     */
    budgetStatusLabel: string;
  }>;
};

export async function getApprovedBudgetEditsPolicy(
  ctx: ServiceContext,
): Promise<ApprovedBudgetEditsPolicyView> {
  if (!canReadTenantConfigArea(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver la política de presupuestos");
  }
  await assertTenantConfigReadAccess(ctx);

  const tenant = await prisma.tenant.findFirst({
    where: { id: ctx.tenantId },
    select: { allowApprovedBudgetEconomicEdits: true },
  });
  if (!tenant) throw new ServiceError("NOT_FOUND", "Tenant no encontrado");

  const scope = await resolveAccessibleProjectScope(ctx);
  const projects = await prisma.project.findMany({
    where: { tenantId: ctx.tenantId, ...projectRowIdWhereForScope(scope) },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      allowApprovedBudgetEconomicEdits: true,
    },
    orderBy: [{ status: "asc" }, { code: "asc" }],
  });

  const projectIds = projects.map((p) => p.id);
  const budgets =
    projectIds.length === 0
      ? []
      : await prisma.budget.findMany({
          where: { tenantId: ctx.tenantId, projectId: { in: projectIds }, ...companyScopeFilter(ctx) },
          select: {
            projectId: true,
            name: true,
            versionNumber: true,
            status: true,
            parentBudgetId: true,
          },
          orderBy: [{ projectId: "asc" }, { versionNumber: "desc" }],
        });

  const budgetsByProject = new Map<string, typeof budgets>();
  for (const b of budgets) {
    const list = budgetsByProject.get(b.projectId) ?? [];
    list.push(b);
    budgetsByProject.set(b.projectId, list);
  }

  return {
    tenantAllow: tenant.allowApprovedBudgetEconomicEdits,
    projects: projects.map((p) => {
      const list = budgetsByProject.get(p.id) ?? [];
      const approved =
        list.find((b) => b.status === "APPROVED" && b.parentBudgetId == null) ??
        list.find((b) => b.status === "APPROVED");
      const approvedAddenda = list.filter(
        (b) => b !== approved && b.status === "APPROVED" && b.parentBudgetId != null,
      );
      const hasApprovedBudget = Boolean(approved);
      const approvedBudgetLabel = approved
        ? `v${approved.versionNumber} — ${approved.name}`
        : null;

      let budgetStatusLabel: string;
      if (approved) {
        const addendumNote =
          approvedAddenda.length === 1
            ? " + 1 adenda"
            : approvedAddenda.length > 1
              ? ` + ${approvedAddenda.length} adendas`
              : "";
        budgetStatusLabel = `Aprobado · ${approvedBudgetLabel}${addendumNote}`;
      } else if (list.length > 0) {
        // Prefer the latest version (ordered desc). Do not hide a newer draft
        // behind an older CLOSED label.
        const latest = list[0]!;
        if (latest.status === "CLOSED") {
          budgetStatusLabel = `Cerrado · v${latest.versionNumber} — ${latest.name} (no editable con esta excepción)`;
        } else {
          const statusHint =
            latest.status === "DRAFT"
              ? "borrador"
              : latest.status === "IN_REVIEW"
                ? "en revisión"
                : latest.status === "RETURNED_FOR_CHANGES"
                  ? "devuelto para cambios"
                  : latest.status === "CANCELLED"
                    ? "cancelado"
                    : latest.status.toLowerCase();
          budgetStatusLabel = `Sin presupuesto aprobado (último: v${latest.versionNumber}, ${statusHint})`;
        }
      } else {
        budgetStatusLabel = "Sin presupuestos";
      }

      return {
        id: p.id,
        code: p.code,
        name: p.name,
        status: p.status,
        allow: p.allowApprovedBudgetEconomicEdits,
        hasApprovedBudget,
        approvedBudgetLabel,
        budgetStatusLabel,
      };
    }),
  };
}

export async function updateTenantApprovedBudgetEditsPolicy(
  raw: unknown,
  ctx: ServiceContext,
): Promise<{ allow: boolean }> {
  if (!canManageApprovedBudgetEditPolicy(ctx.roles)) {
    throw new ServiceError(
      "FORBIDDEN",
      "Solo OWNER o ADMIN pueden cambiar la política de edición de presupuestos aprobados",
    );
  }
  await assertTenantModuleEnabled(ctx, "TENANT_SETTINGS");
  const parsed = updateTenantApprovedBudgetEditsPolicySchema.safeParse(raw);
  if (!parsed.success) {
    throw new ServiceError("VALIDATION", "Valor inválido para la política");
  }
  const { allow } = parsed.data;

  return prisma.$transaction(async (tx) => {
    // Economic writers hold SHARE from before Project/Budget locks until commit.
    await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${ctx.tenantId} FOR NO KEY UPDATE`;
    const before = await tx.tenant.findFirst({
      where: { id: ctx.tenantId },
      select: { allowApprovedBudgetEconomicEdits: true },
    });
    if (!before) throw new ServiceError("NOT_FOUND", "Tenant no encontrado");

    if (before.allowApprovedBudgetEconomicEdits === allow) {
      return { allow };
    }

    await tx.tenant.update({
      where: { id: ctx.tenantId },
      data: { allowApprovedBudgetEconomicEdits: allow },
    });

    await log({
      tenantId: ctx.tenantId,
      actorUserId: ctx.actorUserId,
      action: "tenant.approved_budget_edits_policy.changed",
      entityType: "Tenant",
      entityId: ctx.tenantId,
      before: { allowApprovedBudgetEconomicEdits: before.allowApprovedBudgetEconomicEdits },
      after: { allowApprovedBudgetEconomicEdits: allow },
      ipAddress: ctx.ipAddress,
    }, tx);

    return { allow };
  }, { maxWait: 10_000, timeout: 30_000 });
}

export async function updateProjectApprovedBudgetEditsPolicy(
  raw: unknown,
  ctx: ServiceContext,
): Promise<{ projectId: string; allow: boolean }> {
  if (!canManageApprovedBudgetEditPolicy(ctx.roles)) {
    throw new ServiceError(
      "FORBIDDEN",
      "Solo OWNER o ADMIN pueden habilitar edición de presupuestos aprobados por obra",
    );
  }
  await assertTenantModuleEnabled(ctx, "TENANT_SETTINGS");
  const parsed = updateProjectApprovedBudgetEditsPolicySchema.safeParse(raw);
  if (!parsed.success) {
    throw new ServiceError("VALIDATION", "Datos inválidos");
  }
  const { projectId, allow } = parsed.data;
  await requireProjectAccess(projectId, ctx);

  return prisma.$transaction(async (tx) => {
    await lockProjectForMutation(tx, projectId, ctx.tenantId);
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        tenantId: true,
        status: true,
        allowApprovedBudgetEconomicEdits: true,
        companyId: true,
      },
    });
    if (!project || project.tenantId !== ctx.tenantId) {
      throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
    }

    if (allow && (project.status === "CANCELLED" || project.status === "COMPLETED")) {
      throw new ServiceError(
        "CONFLICT",
        "No se puede habilitar edición de presupuestos aprobados en una obra cancelada o finalizada",
      );
    }

    if (allow) {
      const approved = await tx.budget.findFirst({
        where: { projectId, tenantId: ctx.tenantId, status: "APPROVED", ...companyScopeFilter(ctx) },
        select: { id: true },
      });
      if (!approved) {
        throw new ServiceError(
          "CONFLICT",
          "Esta obra no tiene un presupuesto aprobado. Aprobá uno antes de habilitar la edición excepcional.",
        );
      }
    }

    if (project.allowApprovedBudgetEconomicEdits === allow) {
      return { projectId, allow };
    }

    await tx.project.update({
      where: { id: projectId },
      data: {
        allowApprovedBudgetEconomicEdits: allow,
        updatedBy: ctx.actorUserId,
      },
    });

    await log({
      tenantId: ctx.tenantId,
      actorUserId: ctx.actorUserId,
      action: "project.approved_budget_edits.changed",
      entityType: "Project",
      entityId: projectId,
      projectId,
      companyId: project.companyId ?? undefined,
      before: { allowApprovedBudgetEconomicEdits: project.allowApprovedBudgetEconomicEdits },
      after: { allowApprovedBudgetEconomicEdits: allow },
      ipAddress: ctx.ipAddress,
    }, tx);

    return { projectId, allow };
  }, { maxWait: 10_000, timeout: 30_000 });
}

/** Project-scoped read of D-088 flags for budget UI. */
export async function getProjectApprovedBudgetEditFlags(
  projectId: string,
  ctx: ServiceContext,
): Promise<{ tenantAllow: boolean; projectAllow: boolean; canManagePolicy: boolean }> {
  if (!canViewBudgetsArea(ctx.roles) && !canManageApprovedBudgetEditPolicy(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver la política de presupuestos de la obra");
  }
  const gate = await getTenantModuleGate(ctx);
  assertTenantModuleEnabledWithGate(gate, "BUDGETS");
  await requireProjectAccess(projectId, ctx);
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { tenantId: true, allowApprovedBudgetEconomicEdits: true },
  });
  if (!project || project.tenantId !== ctx.tenantId) {
    throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  }
  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { allowApprovedBudgetEconomicEdits: true },
  });
  return {
    tenantAllow: Boolean(tenant?.allowApprovedBudgetEconomicEdits),
    projectAllow: project.allowApprovedBudgetEconomicEdits,
    canManagePolicy: canManageApprovedBudgetEditPolicy(ctx.roles) && gate.isEnabled("TENANT_SETTINGS"),
  };
}
