"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ZodError } from "zod";
import { auth } from "@bloqer/auth";
import { completeTrialOnboarding, ServiceError } from "@bloqer/services";
import { completeTrialOnboardingInputSchema } from "@bloqer/validators";
import { setActiveTenantCookie } from "@/lib/active-tenant";
import { rethrowNextNavigationError } from "@/lib/next-errors";

export type OnboardingFormState = {
  error: string | null;
};

function firstValidationMessage(err: ZodError): string {
  return err.issues[0]?.message ?? "Revisá los datos ingresados.";
}

export async function completeOnboardingAction(
  _prev: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const raw = {
    displayName: String(formData.get("displayName") ?? ""),
    legalName:   String(formData.get("legalName") ?? ""),
    taxId:       String(formData.get("taxId") ?? ""),
    country:     String(formData.get("country") ?? ""),
    city:        String(formData.get("city") ?? ""),
    address:     String(formData.get("address") ?? ""),
    phone:       String(formData.get("phone") ?? ""),
    website:     String(formData.get("website") ?? ""),
    industry:    String(formData.get("industry") ?? ""),
    companySize: String(formData.get("companySize") ?? ""),
  };

  const parsed = completeTrialOnboardingInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: firstValidationMessage(parsed.error) };
  }

  const h = await headers();
  const ipAddress = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  try {
    const result = await completeTrialOnboarding(session.user.id, parsed.data, { ipAddress });
    await setActiveTenantCookie(result.tenantId);
  } catch (e) {
    rethrowNextNavigationError(e);
    if (e instanceof ServiceError) {
      return { error: e.message };
    }
    return { error: "Ocurrió un error inesperado. Intentá de nuevo." };
  }

  redirect("/dashboard");
}
