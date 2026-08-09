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
    // Fail closed: DB errors must not skip User.status / pwdAt revocation checks.
    return null;
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

/** Session guaranteed to have `user.id` after `getCurrentUser` / `getSession` gates. */
export type AuthenticatedSession = Session & {
  user: NonNullable<Session["user"]> & { id: string };
};

export async function getCurrentUser(): Promise<{
  session: AuthenticatedSession;
  tenantCtx: TenantContext | null;
} | null> {
  const session = await getSession();
  if (!session?.user?.id) return null;

  const tenantCtx = await resolveTenantContext(session.user.id);
  return { session: session as AuthenticatedSession, tenantCtx };
}
