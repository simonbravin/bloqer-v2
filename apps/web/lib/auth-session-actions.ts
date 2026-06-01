"use server";

import { clearActiveTenantCookie } from "@/lib/active-tenant";

/** Clears org preference cookie before client-side Auth.js signOut. */
export async function clearActiveTenantCookieAction(): Promise<void> {
  await clearActiveTenantCookie();
}
