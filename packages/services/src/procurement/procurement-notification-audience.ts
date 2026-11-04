import { prisma } from "@bloqer/database";

import { filterUserIdsByProjectAccess } from "../security/access";

/** A shared project does not grant access to another company's procurement documents. */
export async function filterProcurementNotificationRecipients(params: {
  tenantId: string;
  companyId: string | null;
  projectId: string | null;
  candidateUserIds: string[];
}): Promise<string[]> {
  const ids = [...new Set(params.candidateUserIds.filter(Boolean))];
  if (ids.length === 0) return [];
  const memberships = await prisma.userMembership.findMany({
    where: {
      tenantId: params.tenantId,
      status: "ACTIVE",
      userId: { in: ids },
      user: { status: "ACTIVE" },
      ...(params.companyId ? { OR: [{ companyId: params.companyId }, { companyId: null }] } : {}),
    },
    select: { userId: true },
  });
  return filterUserIdsByProjectAccess(params.tenantId, params.projectId, memberships.map((row) => row.userId));
}
