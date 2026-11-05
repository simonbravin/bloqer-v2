import { prisma, type Prisma } from "@bloqer/database";
import { can, type PermissionAction, type PermissionModule, type UserRole } from "@bloqer/domain";
import { getSoleActiveCompanyIdForTenant } from "../company/company.service";
import { canSuperviseJobsiteLog } from "../jobsite-log/jobsite-log-access";
import { filterUserIdsByProjectAccess } from "../security/access";

export function activeNotificationMembershipWhere(tenantId: string): Prisma.UserMembershipWhereInput {
  return {
    tenantId,
    status: "ACTIVE",
    user: { status: "ACTIVE" },
    OR: [{ companyId: null }, { company: { tenantId, status: "ACTIVE" } }],
  };
}

export async function loadActiveNotificationRecipient(tenantId: string, userId: string) {
  const membership = await prisma.userMembership.findFirst({
    where: { ...activeNotificationMembershipWhere(tenantId), userId },
    select: { companyId: true, roles: true, user: { select: { email: true } } },
  });
  if (!membership) return null;
  return {
    tenantId,
    actorUserId: userId,
    companyId: membership.companyId ?? await getSoleActiveCompanyIdForTenant(tenantId),
    roles: membership.roles,
    email: membership.user.email,
  };
}

type ActiveNotificationRecipient = NonNullable<Awaited<ReturnType<typeof loadActiveNotificationRecipient>>>;

export function sameNotificationRecipientAccess(
  original: Pick<ActiveNotificationRecipient, "companyId" | "roles" | "email">,
  current: ActiveNotificationRecipient | null,
): current is ActiveNotificationRecipient {
  return current !== null && original.companyId === current.companyId &&
    original.email.trim() === current.email.trim() && original.roles.length === current.roles.length &&
    original.roles.every((role) => current.roles.includes(role));
}

/** A shared project never widens the scope of the company that owns its source. */
export async function filterNotificationAudienceForScope(params: {
  tenantId: string;
  companyId: string | null;
  projectId: string | null;
  candidateUserIds: string[];
  canView?: (roles: UserRole[]) => boolean;
}): Promise<string[]> {
  const { tenantId, companyId, projectId, candidateUserIds, canView } = params;
  if (candidateUserIds.length === 0) return [];
  const memberships = await prisma.userMembership.findMany({
    where: { ...activeNotificationMembershipWhere(tenantId), userId: { in: candidateUserIds } },
    select: { userId: true, companyId: true, roles: true },
  });
  const soleCompanyId = companyId && memberships.some((row) => row.companyId === null)
    ? await getSoleActiveCompanyIdForTenant(tenantId)
    : null;
  const visible = memberships.filter((row) => {
    const company = row.companyId ?? soleCompanyId;
    return (!companyId || !company || companyId === company) && (!canView || canView(row.roles));
  });
  return filterUserIdsByProjectAccess(tenantId, projectId, visible.map((row) => row.userId));
}

export type NotificationPermissionTarget = {
  action: PermissionAction;
  module: PermissionModule;
};

export type ResolveNotificationAudienceInput = {
  tenantId: string;
  /** Explicit recipients (e.g. entity creator, uploader). */
  primaryUserIds?: string[];
  /** Union of users with these permission ceilings. */
  permissionTargets?: NotificationPermissionTarget[];
  /** Actor / supervisor to omit from the final list. */
  excludeUserId?: string | null;
  /** Default true: always CC active OWNER/ADMIN memberships. */
  alwaysCcOwnerAdmin?: boolean;
};

/**
 * Active memberships in the tenant whose combined roles satisfy `can(roles, action, module)`.
 */
export async function findActiveUsersForPermission(
  tenantId: string,
  action: PermissionAction,
  module: PermissionModule,
): Promise<string[]> {
  const memberships = await prisma.userMembership.findMany({
    where: activeNotificationMembershipWhere(tenantId),
    select: { userId: true, roles: true },
  });
  const out: string[] = [];
  for (const m of memberships) {
    if (can(m.roles, action, module)) out.push(m.userId);
  }
  return [...new Set(out)];
}

/** OWNER or ADMIN active memberships (fallback / CC recipients). */
export async function findActiveOwnerAdminUserIds(tenantId: string): Promise<string[]> {
  const rows = await prisma.userMembership.findMany({
    where: {
      ...activeNotificationMembershipWhere(tenantId),
      AND: [{ OR: [{ roles: { has: "OWNER" } }, { roles: { has: "ADMIN" } }] }],
    },
    select: { userId: true },
  });
  return [...new Set(rows.map((r) => r.userId))];
}

/** User ids on the project notification roster ([D-091]). Does not filter by ACTIVE membership. */
export async function listProjectTeamUserIds(
  tenantId: string,
  projectId: string,
): Promise<string[]> {
  const rows = await prisma.projectTeamMember.findMany({
    where: { tenantId, projectId },
    select: { userId: true },
  });
  return [...new Set(rows.map((r) => r.userId))];
}

/**
 * SUBMITTED jobsite-log audience ([D-091]):
 * project team members whose **global** roles can supervise ∪ OWNER/ADMIN CC, minus actor.
 * Capataz on the roster without supervise ceiling is excluded.
 */
export async function resolveJobsiteLogSubmittedAudience(params: {
  tenantId: string;
  projectId: string;
  excludeUserId?: string | null;
}): Promise<string[]> {
  const teamIds = await listProjectTeamUserIds(params.tenantId, params.projectId);
  if (teamIds.length === 0) {
    return resolveNotificationAudience({
      tenantId: params.tenantId,
      primaryUserIds: [],
      excludeUserId: params.excludeUserId,
      alwaysCcOwnerAdmin: true,
    });
  }

  const memberships = await prisma.userMembership.findMany({
    where: {
      ...activeNotificationMembershipWhere(params.tenantId),
      userId: { in: teamIds },
    },
    select: { userId: true, roles: true },
  });

  const supervisingTeam = memberships
    .filter((m) => canSuperviseJobsiteLog(m.roles as UserRole[]))
    .map((m) => m.userId);

  return resolveNotificationAudience({
    tenantId: params.tenantId,
    primaryUserIds: supervisingTeam,
    excludeUserId: params.excludeUserId,
    alwaysCcOwnerAdmin: true,
  });
}

/**
 * Builds a deduped list of ACTIVE tenant members who should receive an in-app notification.
 * OWNER/ADMIN are included by default so leadership never misses operational signal.
 */
export async function resolveNotificationAudience(
  input: ResolveNotificationAudienceInput,
): Promise<string[]> {
  const {
    tenantId,
    primaryUserIds = [],
    permissionTargets = [],
    excludeUserId,
    alwaysCcOwnerAdmin = true,
  } = input;

  const trimmedPrimary = [...new Set(primaryUserIds.map((id) => id?.trim()).filter(Boolean))] as string[];

  const [permissionLists, ownerAdmins, activePrimaries] = await Promise.all([
    Promise.all(
      permissionTargets.map((t) => findActiveUsersForPermission(tenantId, t.action, t.module)),
    ),
    alwaysCcOwnerAdmin ? findActiveOwnerAdminUserIds(tenantId) : Promise.resolve([] as string[]),
    trimmedPrimary.length === 0
      ? Promise.resolve([] as string[])
      : prisma.userMembership
          .findMany({
            where: {
              ...activeNotificationMembershipWhere(tenantId),
              userId: { in: trimmedPrimary },
            },
            select: { userId: true },
          })
          .then((rows) => rows.map((r) => r.userId)),
  ]);

  const exclude = excludeUserId?.trim() || null;
  const out = new Set<string>();

  for (const id of [...activePrimaries, ...permissionLists.flat(), ...ownerAdmins]) {
    const uid = id?.trim();
    if (!uid || uid === exclude) continue;
    out.add(uid);
  }

  return [...out];
}
