"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@bloqer/auth";
import { acceptTenantInvitation, peekTenantInvitationForAcceptPage, ServiceError } from "@bloqer/services";
import { buildInvitationAcceptCallbackUrl, buildInvitationLoginHref } from "@/lib/invitation-auth";
import { rethrowNextNavigationError } from "@/lib/next-errors";
import { setActiveTenantCookie } from "@/lib/active-tenant";

export async function acceptTenantInvitationAction(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  const session = await auth();

  if (!session?.user?.id) {
    if (!token) redirect("/invitaciones/aceptar");
    const callbackUrl = buildInvitationAcceptCallbackUrl(token);
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
    await setActiveTenantCookie(result.tenantId);
  } catch (e) {
    rethrowNextNavigationError(e);
    if (e instanceof ServiceError) {
      redirect(`/invitaciones/aceptar?token=${encodeURIComponent(token)}&err=${encodeURIComponent(e.message)}`);
    }
    redirect(`/invitaciones/aceptar?token=${encodeURIComponent(token)}&err=${encodeURIComponent("Error al aceptar")}`);
  }
  redirect("/dashboard?invite=ok");
}
