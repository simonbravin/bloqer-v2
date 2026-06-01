"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@bloqer/auth";
import { provisionPlatformTenant, ServiceError } from "@bloqer/services";
import {
  PLATFORM_INVITE_LINK_FLASH_COOKIE,
  PLATFORM_INVITE_EMAIL_FLASH_COOKIE,
  platformInvitationFlashCookiePath,
} from "@/lib/platform-invitation-flash";
import { getPlatformServiceContext } from "@/lib/platform-service-context";

function emptyToUndefined(v: FormDataEntryValue | null): string | undefined {
  if (v === null || String(v).trim() === "") return undefined;
  return String(v).trim();
}

export async function provisionPlatformTenantAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const ctx = await getPlatformServiceContext(session.user.id);

  const raw = {
    displayName: String(formData.get("displayName") ?? ""),
    legalName: String(formData.get("legalName") ?? ""),
    taxId: String(formData.get("taxId") ?? ""),
    country: String(formData.get("country") ?? ""),
    city: String(formData.get("city") ?? ""),
    address: String(formData.get("address") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    website: emptyToUndefined(formData.get("website")),
    industry: emptyToUndefined(formData.get("industry")),
    companySize: emptyToUndefined(formData.get("companySize")),
    ownerEmail: String(formData.get("ownerEmail") ?? ""),
    ownerRoles: ["OWNER"] as const,
    invitationExpiresInDays: Number(formData.get("invitationExpiresInDays") ?? "7"),
  };

  try {
    const result = await provisionPlatformTenant(raw, ctx);
    if (!result.emailDispatched) {
      const c = await cookies();
      const flashPath = platformInvitationFlashCookiePath(result.tenantId);
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
    revalidatePath("/platform/tenants");
    revalidatePath(`/platform/tenants/${result.tenantId}`);
    redirect(
      `/platform/tenants/${result.tenantId}/invitations/${result.invitationId}?ok=1`,
    );
  } catch (e) {
    if (e instanceof ServiceError) {
      redirect(`/platform/tenants/new?err=${encodeURIComponent(e.message)}`);
    }
    throw e;
  }
}
