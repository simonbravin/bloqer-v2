import { auth } from "@bloqer/auth";
import type { Session } from "next-auth";
import { resolveTenantContext, type TenantContext } from "./tenant";

export async function getSession(): Promise<Session | null> {
  return auth();
}

export async function getCurrentUser(): Promise<{
  session: Session;
  tenantCtx: TenantContext | null;
} | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const tenantCtx = await resolveTenantContext(session.user.id);
  return { session, tenantCtx };
}
