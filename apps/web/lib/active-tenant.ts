import { cookies } from "next/headers";
import { isUuid } from "@bloqer/utils";

/** HttpOnly preference for multi-tenant users; subscription/plan always follows this tenant id. */
export const ACTIVE_TENANT_COOKIE = "bloqer_active_tenant_id";

const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 365;

export async function readActiveTenantIdFromCookies(): Promise<string | null> {
  const c = await cookies();
  const raw = c.get(ACTIVE_TENANT_COOKIE)?.value?.trim();
  if (!raw || !isUuid(raw)) return null;
  return raw;
}

export async function setActiveTenantCookie(tenantId: string): Promise<void> {
  if (!isUuid(tenantId)) return;
  const c = await cookies();
  c.set(ACTIVE_TENANT_COOKIE, tenantId, {
    httpOnly: true,
    sameSite: "lax",
    path:     "/",
    maxAge:   COOKIE_MAX_AGE_SEC,
  });
}

export async function clearActiveTenantCookie(): Promise<void> {
  const c = await cookies();
  c.delete({ name: ACTIVE_TENANT_COOKIE, path: "/" });
}
