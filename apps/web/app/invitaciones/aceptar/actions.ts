"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { acceptTenantInvitation, peekTenantInvitationForAcceptPage, ServiceError } from "@bloqer/services";
import { getSession } from "@/lib/auth";
import { buildInvitationLoginHref } from "@/lib/invitation-auth";
import {
  clearInviteAcceptToken,
  readInviteAcceptToken,
} from "@/lib/invitation-accept-token";
import { rethrowNextNavigationError } from "@/lib/next-errors";
import { setActiveTenantCookie } from "@/lib/active-tenant";

export async function acceptTenantInvitationAction(_formData: FormData) {
  const token = (await readInviteAcceptToken())?.trim() || "";
  const session = await getSession();

  if (!session?.user?.id) {
    if (!token) redirect("/invitaciones/aceptar");
    // Opaque callback — token lives in httpOnly cookie, not Referer/history.
    const callbackUrl = "/invitaciones/aceptar";
    const peek = await peekTenantInvitationForAcceptPage(token);
    redirect(
      peek
        ? buildInvitationLoginHref(callbackUrl, peek.email)
        : `/login?callbackUrl=${encodeURIComponent(callbackUrl)}&selectAccount=1`,
    );
  }

  if (!token) {
    redirect("/invitaciones/aceptar");
  }

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  try {
    const result = await acceptTenantInvitation(token, { actorUserId: session.user.id, ipAddress: ip });
    await clearInviteAcceptToken();
    await setActiveTenantCookie(result.tenantId);
  } catch (e) {
    rethrowNextNavigationError(e);
    // Permanent failures: drop cookie so a stale/attacker token cannot keep retrying.
    if (
      e instanceof ServiceError &&
      (e.code === "NOT_FOUND" || e.code === "CONFLICT" || e.code === "FORBIDDEN")
    ) {
      await clearInviteAcceptToken();
    }
    if (e instanceof ServiceError) {
      redirect(`/invitaciones/aceptar?err=${encodeURIComponent(e.message)}`);
    }
    redirect(`/invitaciones/aceptar?err=${encodeURIComponent("Error al aceptar")}`);
  }
  redirect("/dashboard?invite=ok");
}
