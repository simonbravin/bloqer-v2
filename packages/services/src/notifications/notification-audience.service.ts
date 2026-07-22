import { prisma } from "@bloqer/database";
import { can, type PermissionAction, type PermissionModule } from "@bloqer/domain";

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
    where: { tenantId, status: "ACTIVE" },
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
      tenantId,
      status: "ACTIVE",
      OR: [{ roles: { has: "OWNER" } }, { roles: { has: "ADMIN" } }],
    },
    select: { userId: true },
  });
  return [...new Set(rows.map((r) => r.userId))];
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
              tenantId,
              status: "ACTIVE",
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
