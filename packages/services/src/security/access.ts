/**
 * Central authorization capabilities (G4) + project ACL (G3 / D-111).
 *
 * Permission = what. ProjectMembership = where (when MEMBERSHIP_SCOPED).
 * Do not scatter ProjectMembership queries or `role === "OWNER"` checks.
 */

import { prisma, type ProjectAccessMode } from "@bloqer/database";
import { can, type UserRole } from "@bloqer/domain";
import type { ServiceContext } from "../types";
import { ServiceError } from "../types";
import { requireProjectInTenant, type ProjectTenantScope } from "../project/require-project-in-tenant";
import { hasCompanyFinanceRole } from "@bloqer/domain";

const projectAccessModeCache = new Map<string, { mode: ProjectAccessMode; at: number }>();
/** Short TTL: multi-instance (Vercel) can stay stale until expiry; mode flips clear local cache only. */
const MODE_TTL_MS = 5_000;
/** Bumped by clearProjectAccessModeCache so request-scoped WeakMap bags drop stale mode/scope. */
let aclCacheGeneration = 0;

export type ProjectAccessScope = "ALL" | { projectIds: string[] };

type AclRequestBag = {
  generation: number;
  mode?: Promise<ProjectAccessMode>;
  scope?: Promise<ProjectAccessScope>;
};

/** Request-scoped memo (same ServiceContext object). Not persisted. */
const aclByCtx = new WeakMap<object, AclRequestBag>();

function aclBag(ctx: ServiceContext): AclRequestBag {
  let bag = aclByCtx.get(ctx);
  if (!bag || bag.generation !== aclCacheGeneration) {
    bag = { generation: aclCacheGeneration };
    aclByCtx.set(ctx, bag);
  }
  return bag;
}

export async function getTenantProjectAccessMode(
  tenantId: string,
): Promise<ProjectAccessMode> {
  const hit = projectAccessModeCache.get(tenantId);
  if (hit && Date.now() - hit.at < MODE_TTL_MS) return hit.mode;
  const row = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { projectAccessMode: true },
  });
  const mode = row?.projectAccessMode ?? "TENANT_WIDE";
  projectAccessModeCache.set(tenantId, { mode, at: Date.now() });
  return mode;
}

async function getTenantProjectAccessModeForCtx(
  ctx: ServiceContext,
): Promise<ProjectAccessMode> {
  const bag = aclBag(ctx);
  if (!bag.mode) bag.mode = getTenantProjectAccessMode(ctx.tenantId);
  return bag.mode;
}

/** Test helper — clear TTL cache after toggling mode in fixtures. */
export function clearProjectAccessModeCache(): void {
  projectAccessModeCache.clear();
  aclCacheGeneration += 1;
}

/**
 * Tenant-wide project visibility (bypass membership under MEMBERSHIP_SCOPED).
 * Based on permission ceiling, not `role === OWNER`.
 */
export function hasTenantWideProjectAccess(roles: ServiceContext["roles"]): boolean {
  return (
    can(roles, "APPROVE", "PROJECTS") ||
    can(roles, "APPROVE", "USERS_PERMISSIONS") ||
    can(roles, "APPROVE", "TENANT_SETTINGS")
  );
}

/** G1-C / documents: VIEW PROJECTS is enough to see project-linked documents. */
export function canViewProjectDocuments(roles: ServiceContext["roles"]): boolean {
  return can(roles, "VIEW", "DOCUMENTS") || can(roles, "VIEW", "PROJECTS");
}

/**
 * Procurement capability (G1-C): explicit procurement modules only.
 * Does NOT grant via VIEW PROJECTS alone.
 */
export function canViewProcurementCapability(roles: ServiceContext["roles"]): boolean {
  return (
    can(roles, "VIEW", "PROCUREMENT") ||
    can(roles, "VIEW", "PURCHASE_ORDERS") ||
    can(roles, "VIEW", "PURCHASE_REQUESTS")
  );
}

/**
 * Project financial capability (G4): explicit finance/budget/cert modules.
 * Does NOT grant via VIEW PROJECTS alone.
 */
export function canViewProjectFinancialsCapability(
  roles: ServiceContext["roles"],
): boolean {
  return (
    can(roles, "VIEW", "AP") ||
    can(roles, "VIEW", "AR") ||
    can(roles, "VIEW", "BUDGETS") ||
    can(roles, "VIEW", "CERTIFICATIONS") ||
    can(roles, "VIEW", "EXPENSES_PAYMENTS")
  );
}

/**
 * Company financial capability (CxP/CxC/hub/GL read) — D-056 company-finance roles
 * with at least one company finance module. Treasury is separate (`canViewTreasury`).
 */
export function canViewCompanyFinancialsCapability(
  roles: ServiceContext["roles"],
): boolean {
  if (!hasCompanyFinanceRole(roles)) return false;
  return (
    can(roles, "VIEW", "AP") ||
    can(roles, "VIEW", "AR") ||
    can(roles, "VIEW", "ACCOUNTING")
  );
}

/**
 * Treasury / banks / cash / movements — requires VIEW TREASURY on matrix.
 * After D-111 / D-056 amendment: VIEWER preset no longer has TREASURY VIEW,
 * so this is permission-based (not `role !== VIEWER`).
 */
export function canViewTreasury(roles: ServiceContext["roles"]): boolean {
  return can(roles, "VIEW", "TREASURY");
}

/**
 * Resolves which projects the actor may access for list/aggregate queries.
 * TENANT_WIDE → ALL (still requires VIEW PROJECTS at call site for lists).
 * MEMBERSHIP_SCOPED → ALL if tenant-wide access, else membership ids.
 * Memoized per ServiceContext for the request.
 */
export async function resolveAccessibleProjectScope(
  ctx: ServiceContext,
): Promise<ProjectAccessScope> {
  const bag = aclBag(ctx);
  if (!bag.scope) {
    bag.scope = (async () => {
      const mode = await getTenantProjectAccessModeForCtx(ctx);
      if (mode === "TENANT_WIDE") return "ALL" as const;
      if (hasTenantWideProjectAccess(ctx.roles)) return "ALL" as const;

      const rows = await prisma.projectMembership.findMany({
        where: { tenantId: ctx.tenantId, userId: ctx.actorUserId },
        select: { projectId: true },
      });
      return { projectIds: rows.map((r) => r.projectId) };
    })();
  }
  return bag.scope;
}

/** Prisma `where` fragment for projectId scoping (aggregations). */
export function projectIdWhereForScope(
  scope: ProjectAccessScope,
): Record<string, never> | { projectId: { in: string[] } } {
  if (scope === "ALL") return {};
  return { projectId: { in: scope.projectIds } };
}

/** Filter on Project.id (listProjects / dashboard counts). */
export function projectRowIdWhereForScope(
  scope: ProjectAccessScope,
): { id?: { in: string[] } } | Record<string, never> {
  if (scope === "ALL") return {};
  return { id: { in: scope.projectIds } };
}

/**
 * When listing project-scoped rows without an explicit projectId:
 * - company capability → no project filter (true company-wide)
 * - else → restrict to accessible projectIds (never tenant-wide then strip)
 */
export async function projectScopeWhereForOptionalProject(
  ctx: ServiceContext,
  explicitProjectId: string | null | undefined,
  opts: { companyWideAllowed: boolean },
): Promise<{ projectId: string } | { projectId: { in: string[] } } | Record<string, never>> {
  if (explicitProjectId) {
    await requireProjectAccess(explicitProjectId, ctx);
    return { projectId: explicitProjectId };
  }
  if (opts.companyWideAllowed) {
    return {};
  }
  const scope = await resolveAccessibleProjectScope(ctx);
  return projectIdWhereForScope(scope) as { projectId: { in: string[] } } | Record<string, never>;
}

export async function canAccessProject(
  projectId: string,
  ctx: ServiceContext,
): Promise<boolean> {
  try {
    await requireProjectInTenant(projectId, ctx.tenantId);
  } catch {
    return false;
  }
  const mode = await getTenantProjectAccessModeForCtx(ctx);
  if (mode === "TENANT_WIDE") return true;
  if (hasTenantWideProjectAccess(ctx.roles)) return true;

  const row = await prisma.projectMembership.findUnique({
    where: {
      tenantId_projectId_userId: {
        tenantId: ctx.tenantId,
        projectId,
        userId: ctx.actorUserId,
      },
    },
    select: { id: true },
  });
  return Boolean(row);
}

/**
 * Tenant check + membership ACL when MEMBERSHIP_SCOPED.
 * Does NOT check area permissions (procurement/finance) — callers combine both.
 */
export async function requireProjectAccess(
  projectId: string,
  ctx: ServiceContext,
): Promise<ProjectTenantScope> {
  const project = await requireProjectInTenant(projectId, ctx.tenantId);
  const mode = await getTenantProjectAccessModeForCtx(ctx);
  if (mode === "TENANT_WIDE") return project;
  if (hasTenantWideProjectAccess(ctx.roles)) return project;

  const row = await prisma.projectMembership.findUnique({
    where: {
      tenantId_projectId_userId: {
        tenantId: ctx.tenantId,
        projectId,
        userId: ctx.actorUserId,
      },
    },
    select: { id: true },
  });
  if (!row) {
    throw new ServiceError("FORBIDDEN", "No tenés acceso a esta obra.");
  }
  return project;
}

/**
 * When an entity has a projectId, enforce membership ACL.
 * Corporate rows (projectId null) are skipped — callers must gate with company permissions.
 */
export async function requireProjectAccessIfPresent(
  projectId: string | null | undefined,
  ctx: ServiceContext,
): Promise<void> {
  if (projectId) {
    await requireProjectAccess(projectId, ctx);
  }
}

/**
 * Filter notification / fan-out recipients by D-111 project ACL.
 * - No projectId (company-level) → unchanged (company permission already gated audience).
 * - TENANT_WIDE → unchanged.
 * - MEMBERSHIP_SCOPED → keep tenant-wide roles (OWNER/ADMIN/…) or explicit ProjectMembership.
 */
export async function filterUserIdsByProjectAccess(
  tenantId: string,
  projectId: string | null | undefined,
  userIds: string[],
): Promise<string[]> {
  if (!projectId || userIds.length === 0) return userIds;
  const mode = await getTenantProjectAccessMode(tenantId);
  if (mode === "TENANT_WIDE") return userIds;

  const unique = [...new Set(userIds)];
  const [memberships, projectMembers] = await Promise.all([
    prisma.userMembership.findMany({
      where: { tenantId, status: "ACTIVE", userId: { in: unique } },
      select: { userId: true, roles: true },
    }),
    prisma.projectMembership.findMany({
      where: { tenantId, projectId, userId: { in: unique } },
      select: { userId: true },
    }),
  ]);
  const rolesByUser = new Map(memberships.map((m) => [m.userId, m.roles]));
  const memberSet = new Set(projectMembers.map((m) => m.userId));

  return unique.filter((userId) => {
    const roles = rolesByUser.get(userId) ?? [];
    if (hasTenantWideProjectAccess(roles)) return true;
    return memberSet.has(userId);
  });
}

/** Convenience: project ACL + project financials capability. */
export async function canViewProjectFinancials(
  ctx: ServiceContext,
  projectId: string,
): Promise<boolean> {
  if (!canViewProjectFinancialsCapability(ctx.roles)) return false;
  return canAccessProject(projectId, ctx);
}

export async function canViewCompanyFinancials(
  ctx: ServiceContext,
): Promise<boolean> {
  return canViewCompanyFinancialsCapability(ctx.roles);
}

export type { ProjectAccessMode };
export type { UserRole };
