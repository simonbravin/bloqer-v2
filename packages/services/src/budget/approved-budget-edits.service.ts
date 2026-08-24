/**
 * D-088 — exceptional economic edits on APPROVED budgets.
 * Tenant kill-switch + per-project flag (both default OFF). OWNER/ADMIN only for toggles.
 */

import { prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import {
  updateTenantApprovedBudgetEditsPolicySchema,
  updateProjectApprovedBudgetEditsPolicySchema,
} from "@bloqer/validators";
import { log } from "../audit/audit.service";
import { ServiceContext, ServiceError } from "../types";
import { canViewBudgetsArea } from "../project/project-nav-guards";
import { canManageApprovedBudgetEditPolicy } from "./budget.service";

export type ApprovedBudgetEditsPolicyView = {
  tenantAllow: boolean;
  projects: Array<{
    id: string;
    code: string;
    name: string;
    status: string;
    allow: boolean;
  }>;
};

export async function getApprovedBudgetEditsPolicy(
  ctx: ServiceContext,
): Promise<ApprovedBudgetEditsPolicyView> {
  if (!can(ctx.roles, "VIEW", "TENANT_SETTINGS") && !canManageApprovedBudgetEditPolicy(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver la política de presupuestos");
  }

  const tenant = await prisma.tenant.findFirst({
    where: { id: ctx.tenantId },
    select: { allowApprovedBudgetEconomicEdits: true },
  });
  if (!tenant) throw new ServiceError("NOT_FOUND", "Tenant no encontrado");

  const projects = await prisma.project.findMany({
    where: { tenantId: ctx.tenantId },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      allowApprovedBudgetEconomicEdits: true,
    },
    orderBy: [{ status: "asc" }, { code: "asc" }],
  });

  return {
    tenantAllow: tenant.allowApprovedBudgetEconomicEdits,
    projects: projects.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      status: p.status,
      allow: p.allowApprovedBudgetEconomicEdits,
    })),
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
  const parsed = updateTenantApprovedBudgetEditsPolicySchema.safeParse(raw);
  if (!parsed.success) {
    throw new ServiceError("VALIDATION", "Valor inválido para la política");
  }
  const { allow } = parsed.data;

  const before = await prisma.tenant.findFirst({
    where: { id: ctx.tenantId },
    select: { allowApprovedBudgetEconomicEdits: true },
  });
  if (!before) throw new ServiceError("NOT_FOUND", "Tenant no encontrado");

  if (before.allowApprovedBudgetEconomicEdits === allow) {
    return { allow };
  }

  await prisma.tenant.update({
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
  });

  return { allow };
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
  const parsed = updateProjectApprovedBudgetEditsPolicySchema.safeParse(raw);
  if (!parsed.success) {
    throw new ServiceError("VALIDATION", "Datos inválidos");
  }
  const { projectId, allow } = parsed.data;

  const project = await prisma.project.findUnique({
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

  if (project.allowApprovedBudgetEconomicEdits === allow) {
    return { projectId, allow };
  }

  await prisma.project.update({
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
  });

  return { projectId, allow };
}

/** Project-scoped read of D-088 flags for budget UI. */
export async function getProjectApprovedBudgetEditFlags(
  projectId: string,
  ctx: ServiceContext,
): Promise<{ tenantAllow: boolean; projectAllow: boolean; canManagePolicy: boolean }> {
  if (!canViewBudgetsArea(ctx.roles) && !canManageApprovedBudgetEditPolicy(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver la política de presupuestos de la obra");
  }
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
    canManagePolicy: canManageApprovedBudgetEditPolicy(ctx.roles),
  };
}
