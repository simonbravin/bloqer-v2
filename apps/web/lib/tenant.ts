import { getSessionTenantContext, type SessionTenantContext } from "@bloqer/services";

export type TenantContext = SessionTenantContext;

/** Resolves tenant + roles from the user's ACTIVE membership (D-036: one row per user+tenant). */
export async function resolveTenantContext(userId: string): Promise<TenantContext | null> {
  return getSessionTenantContext(userId);
}
