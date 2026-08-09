"use server";

import { clearActiveTenantCookie } from "@/lib/active-tenant";
import { clearInviteAcceptToken } from "@/lib/invitation-accept-token";

/** Clears org preference + invite cookies before client-side Auth.js signOut. */
export async function clearActiveTenantCookieAction(): Promise<void> {
  await Promise.all([clearActiveTenantCookie(), clearInviteAcceptToken()]);
}
