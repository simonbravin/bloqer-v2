"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { UserRole } from "@bloqer/domain";
import { OVERVIEW_ROLES } from "@bloqer/domain";
import { auth } from "@bloqer/auth";
import {
  cancelPlatformTenantInvitation,
  createPlatformTenantInvitation,
  ServiceError,
} from "@bloqer/services";
import {
  PLATFORM_INVITE_LINK_FLASH_COOKIE,
  PLATFORM_INVITE_EMAIL_FLASH_COOKIE,
  platformInvitationFlashCookiePath,
} from "@/lib/platform-invitation-flash";
import { getPlatformServiceContext } from "@/lib/platform-service-context";

function collectRolesFromForm(formData: FormData): UserRole[] {
  const roles: UserRole[] = [];
  for (const r of OVERVIEW_ROLES) {
    if (formData.get(`role_${r}`) === "on") roles.push(r);
  }
  return roles;
}

async function platformCtxOrRedirect() {
  const s = await auth();
  if (!s?.user?.id) redirect("/login");
  return getPlatformServiceContext(s.user.id);
}

export async function createPlatformTenantInvitationAction(formData: FormData) {
  const ctx = await platformCtxOrRedirect();
  const tenantId = String(formData.get("tenantId") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const expiresInDays = Number(formData.get("expiresInDays") ?? "7");
  const companyIdRaw = formData.get("companyId");
  const companyId =
    companyIdRaw === null || String(companyIdRaw).trim() === ""
      ? null
      : String(companyIdRaw);
  const roles = collectRolesFromForm(formData);

  try {
    const result = await createPlatformTenantInvitation(
      { tenantId, email, roles, expiresInDays, companyId },
      ctx,
    );
    if (!result.emailDispatched) {
      const c = await cookies();
      const flashPath = platformInvitationFlashCookiePath(tenantId);
      c.set(PLATFORM_INVITE_LINK_FLASH_COOKIE, result.invitationLink, {
        maxAge:   120,
        httpOnly: true,
        sameSite: "lax",
        path:     flashPath,
      });
      if (result.emailFailureMessage) {
        c.set(PLATFORM_INVITE_EMAIL_FLASH_COOKIE, result.emailFailureMessage, {
          maxAge:   120,
          httpOnly: true,
          sameSite: "lax",
          path:     flashPath,
        });
      }
    }
    revalidatePath(`/platform/tenants/${tenantId}/invitations`);
    redirect(`/platform/tenants/${tenantId}/invitations/${result.invitationId}?ok=1`);
  } catch (e) {
    if (e instanceof ServiceError) {
      redirect(
        `/platform/tenants/${tenantId}/invitations/new?err=${encodeURIComponent(e.message)}`,
      );
    }
    throw e;
  }
}

export async function cancelPlatformTenantInvitationAction(formData: FormData) {
  const ctx = await platformCtxOrRedirect();
  const tenantId = String(formData.get("tenantId") ?? "");
  const invitationId = String(formData.get("invitationId") ?? "");
  try {
    await cancelPlatformTenantInvitation(tenantId, invitationId, ctx);
  } catch (e) {
    if (e instanceof ServiceError) {
      redirect(
        `/platform/tenants/${tenantId}/invitations/${invitationId}?err=${encodeURIComponent(e.message)}`,
      );
    }
    throw e;
  }
  revalidatePath(`/platform/tenants/${tenantId}/invitations`);
  redirect(`/platform/tenants/${tenantId}/invitations?ok=1`);
}
