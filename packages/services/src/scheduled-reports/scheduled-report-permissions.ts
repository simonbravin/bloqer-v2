import { ServiceContext, ServiceError } from "../types";

/** Phase 17B — scheduled report configuration (OWNER / ADMIN only). */
export function canManageScheduledReports(ctx: ServiceContext): boolean {
  return ctx.roles.some((r) => r === "OWNER" || r === "ADMIN");
}

export function assertCanManageScheduledReports(ctx: ServiceContext): void {
  if (!canManageScheduledReports(ctx)) {
    throw new ServiceError("FORBIDDEN", "Solo OWNER o ADMIN pueden gestionar reportes programados");
  }
}
