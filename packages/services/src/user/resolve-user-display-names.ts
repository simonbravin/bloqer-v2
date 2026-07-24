import { prisma } from "@bloqer/database";

const UNKNOWN_USER_LABEL = "Usuario desconocido";

function isUserId(id: string | null | undefined): id is string {
  return typeof id === "string" && id.length > 0;
}

/**
 * Batch-resolve display labels for user ids (name, else email).
 * Every requested id is present in the map; missing users map to "Usuario desconocido".
 */
export async function resolveUserDisplayNames(
  userIds: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(userIds.filter(isUserId))];
  if (uniqueIds.length === 0) return new Map();

  const users = await prisma.user.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, name: true, email: true },
  });

  const map = new Map(
    users.map((user) => {
      const label = user.name?.trim() || user.email?.trim() || UNKNOWN_USER_LABEL;
      return [user.id, label] as const;
    }),
  );

  for (const id of uniqueIds) {
    if (!map.has(id)) map.set(id, UNKNOWN_USER_LABEL);
  }

  return map;
}

/** Lookup a display name; `null` when there is no actor id. */
export function userDisplayNameFromMap(
  nameById: Map<string, string>,
  userId: string | null | undefined,
): string | null {
  if (!isUserId(userId)) return null;
  return nameById.get(userId) ?? UNKNOWN_USER_LABEL;
}
