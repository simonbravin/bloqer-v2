"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@bloqer/auth";
import { acceptTenantInvitation, ServiceError } from "@bloqer/services";

export async function acceptTenantInvitationAction(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  const session = await auth();
  if (!session?.user?.id) {
    if (!token) redirect("/invitaciones/aceptar");
    redirect(`/login?callbackUrl=${encodeURIComponent(`/invitaciones/aceptar?token=${encodeURIComponent(token)}`)}`);
  }
  if (!token) {
    redirect("/invitaciones/aceptar");
  }
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  try {
    await acceptTenantInvitation(token, { actorUserId: session.user.id, ipAddress: ip });
  } catch (e) {
    if (e instanceof ServiceError) {
      redirect(`/invitaciones/aceptar?token=${encodeURIComponent(token)}&err=${encodeURIComponent(e.message)}`);
    }
    redirect(`/invitaciones/aceptar?token=${encodeURIComponent(token)}&err=${encodeURIComponent("Error al aceptar")}`);
  }
  redirect("/dashboard?invite=ok");
}
