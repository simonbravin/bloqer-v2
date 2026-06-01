import { getSessionTenantContext, type SessionTenantContext } from "@bloqer/services";
import { readActiveTenantIdFromCookies } from "./active-tenant";

export type TenantContext = SessionTenantContext;

/** Resolves tenant + roles from ACTIVE membership; prefers {@link ACTIVE_TENANT_COOKIE} when valid. */
export async function resolveTenantContext(userId: string): Promise<TenantContext | null> {
  const preferredTenantId = await readActiveTenantIdFromCookies();
  return getSessionTenantContext(userId, { preferredTenantId });
}
