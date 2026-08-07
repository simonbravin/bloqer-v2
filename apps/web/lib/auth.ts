import { auth, signOut } from "@bloqer/auth";
import { getUserAuthGate, isLoginEligibleStatus } from "@bloqer/services";
import type { Session } from "next-auth";
import { resolveTenantContext, type TenantContext } from "./tenant";

/**
 * Validates JWT `pwdAt` against DB `passwordUpdatedAt`, rejects disabled accounts,
 * and signs out on mismatch (password reset / Google takeover / suspend).
 *
 * Important: invalidation must always return `null` even if `signOut` cannot clear
 * cookies during RSC render (Next.js may throw on `cookies().set` outside actions).
 */
export async function getSession(): Promise<Session | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  let gate: Awaited<ReturnType<typeof getUserAuthGate>>;
  try {
    gate = await getUserAuthGate(session.user.id);
  } catch {
    // Transient DB errors: keep session for availability; retry on next request.
    // Do not share this path with signOut / invalidation failures.
    return session;
  }

  if (!gate || !isLoginEligibleStatus(gate.status)) {
    try {
      await signOut({ redirect: false });
    } catch {
      // RSC may not clear the cookie; still deny this request.
    }
    return null;
  }

  const dbIso = gate.passwordUpdatedAt?.toISOString() ?? null;
  const claim = session.user.pwdAt ?? null;
  if (dbIso !== claim) {
    try {
      await signOut({ redirect: false });
    } catch {
      // RSC may not clear the cookie; still deny this request.
    }
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
