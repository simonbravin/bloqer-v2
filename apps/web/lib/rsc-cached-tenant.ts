import { cache } from "react";
import { getMyFieldPendingCounts, type ServiceContext } from "@bloqer/services";

const loadPendingCounts = cache(
  async (tenantId: string, actorUserId: string, companyId: string, rolesKey: string) => {
    return getMyFieldPendingCounts({
      tenantId,
      actorUserId,
      companyId: companyId === "" ? null : companyId,
      roles: JSON.parse(rolesKey) as ServiceContext["roles"],
    });
  },
);

/** Dedupes Field pending counts within a single RSC request (layout + Field Home). */
export function getCachedFieldPendingCounts(ctx: ServiceContext) {
  return loadPendingCounts(
    ctx.tenantId,
    ctx.actorUserId,
    ctx.companyId ?? "",
    JSON.stringify(ctx.roles),
  );
}
