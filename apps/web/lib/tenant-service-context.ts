import { headers } from "next/headers";
import type { ServiceContext } from "@bloqer/services";
import { getCurrentUser } from "@/lib/auth";

export async function buildTenantServiceContext(): Promise<ServiceContext | null> {
  const current = await getCurrentUser();
  if (!current?.tenantCtx || !current.session.user?.id) return null;
  const h = await headers();
  return {
    actorUserId: current.session.user.id,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
    ipAddress:   h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  };
}
