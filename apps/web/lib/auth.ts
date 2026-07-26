import { auth, signOut } from "@bloqer/auth";
import { getUserAuthGate, isLoginEligibleStatus } from "@bloqer/services";
import type { Session } from "next-auth";
import { resolveTenantContext, type TenantContext } from "./tenant";

/**
 * Validates JWT `pwdAt` against DB `passwordUpdatedAt`, rejects disabled accounts,
 * and signs out on mismatch (password reset / Google takeover / suspend).
 */
export async function getSession(): Promise<Session | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  try {
    const gate = await getUserAuthGate(session.user.id);
    if (!gate || !isLoginEligibleStatus(gate.status)) {
      await signOut({ redirect: false });
      return null;
    }

    const dbIso = gate.passwordUpdatedAt?.toISOString() ?? null;
    const claim = session.user.pwdAt ?? null;
    if (dbIso !== claim) {
      await signOut({ redirect: false });
      return null;
    }
  } catch {
    // Transient DB errors should not wipe the session; retry on next request.
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
