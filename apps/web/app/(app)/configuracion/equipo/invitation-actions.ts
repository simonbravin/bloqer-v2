"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { UserRole } from "@bloqer/domain";
import { OVERVIEW_ROLES } from "@bloqer/domain";
import {
  cancelTenantInvitation,
  createTenantInvitation,
  ServiceError,
} from "@bloqer/services";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { rethrowNextNavigationError } from "@/lib/next-errors";
import {
  TENANT_INVITE_LINK_FLASH_COOKIE,
  TENANT_INVITE_EMAIL_FLASH_COOKIE,
  tenantInvitationFlashCookiePath,
} from "@/lib/tenant-invitation-flash";

function collectRolesFromForm(formData: FormData): UserRole[] {
  const roles: UserRole[] = [];
  for (const r of OVERVIEW_ROLES) {
    if (formData.get(`role_${r}`) === "on") roles.push(r);
  }
  return roles;
}

export async function createTenantInvitationAction(formData: FormData) {
  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");
  const email = String(formData.get("email") ?? "").trim();
  const expiresInDays = Number(formData.get("expiresInDays") ?? "7");
  const roles = collectRolesFromForm(formData);
  try {
    const result = await createTenantInvitation({ email, roles, expiresInDays }, ctx);
    if (!result.emailDispatched) {
      const c = await cookies();
      const flashPath = tenantInvitationFlashCookiePath(result.invitationId);
      c.set(TENANT_INVITE_LINK_FLASH_COOKIE, result.invitationLink, {
        maxAge:     120,
        httpOnly:   true,
        sameSite:   "lax",
        path:       flashPath,
      });
      if (result.emailFailureMessage) {
        c.set(TENANT_INVITE_EMAIL_FLASH_COOKIE, result.emailFailureMessage, {
          maxAge:     120,
          httpOnly:   true,
          sameSite:   "lax",
          path:       flashPath,
        });
      }
    }
    revalidatePath("/configuracion/equipo");
    revalidatePath(`/configuracion/equipo/invitaciones/${result.invitationId}`);
    redirect(`/configuracion/equipo/invitaciones/${result.invitationId}`);
  } catch (e) {
    rethrowNextNavigationError(e);
    if (e instanceof ServiceError) {
      redirect(`/configuracion/equipo/invitar?err=${encodeURIComponent(e.message)}`);
    }
    throw e;
  }
}

export async function cancelTenantInvitationAction(formData: FormData) {
  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");
  const invitationId = String(formData.get("invitationId") ?? "");
  try {
    await cancelTenantInvitation(invitationId, ctx);
  } catch (e) {
    rethrowNextNavigationError(e);
    if (e instanceof ServiceError) {
      redirect(`/configuracion/equipo/invitaciones/${invitationId}?err=${encodeURIComponent(e.message)}`);
    }
    throw e;
  }
  revalidatePath("/configuracion/equipo");
  revalidatePath(`/configuracion/equipo/invitaciones/${invitationId}`);
  redirect(`/configuracion/equipo/invitaciones/${invitationId}?ok=cancelled`);
}
