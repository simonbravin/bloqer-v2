import { auth, signOut } from "@bloqer/auth";
import { getUserPasswordUpdatedAt } from "@bloqer/services";
import type { Session } from "next-auth";
import { resolveTenantContext, type TenantContext } from "./tenant";

/**
 * Validates JWT `pwdAt` against DB `passwordUpdatedAt` and signs out on mismatch
 * (password reset / Google takeover of a credentials stub).
 */
export async function getSession(): Promise<Session | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const dbPwdAt = await getUserPasswordUpdatedAt(session.user.id);
  const dbIso = dbPwdAt?.toISOString() ?? null;
  const claim = session.user.pwdAt ?? null;
  if (dbIso !== claim) {
    await signOut({ redirect: false });
    return null;
  }

  return session;
}

export async function getCurrentUser(): Promise<{
  session: Session;
  tenantCtx: TenantContext | null;
} | null> {
  const session = await getSession();
  if (!session?.user?.id) return null;

  const tenantCtx = await resolveTenantContext(session.user.id);
  return { session, tenantCtx };
}
