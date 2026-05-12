"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@bloqer/auth";
import {
  ServiceError,
  updatePlatformTenantPlanMetadata,
  updatePlatformTenantStatus,
  updateTenantModuleSetting,
} from "@bloqer/services";
import { getPlatformServiceContext } from "@/lib/platform-service-context";

async function platformCtxOrRedirect() {
  const s = await auth();
  if (!s?.user?.id) redirect("/login");
  return getPlatformServiceContext(s.user.id);
}

export async function updatePlatformTenantStatusAction(formData: FormData) {
  const ctx = await platformCtxOrRedirect();
  const tenantId = String(formData.get("tenantId") ?? "");
  const status = String(formData.get("status") ?? "");
  const suspendedReasonRaw = formData.get("suspendedReason");
  const suspendedReason =
    suspendedReasonRaw === null || suspendedReasonRaw === ""
      ? null
      : String(suspendedReasonRaw).slice(0, 512);
  try {
    await updatePlatformTenantStatus({ tenantId, status, suspendedReason }, ctx);
  } catch (e) {
    if (e instanceof ServiceError) {
      redirect(`/platform/tenants/${tenantId}/settings?err=${encodeURIComponent(e.message)}`);
    }
    redirect(`/platform/tenants/${tenantId}/settings?err=${encodeURIComponent("Error al guardar")}`);
  }
  revalidatePath("/platform/tenants");
  revalidatePath(`/platform/tenants/${tenantId}`);
  revalidatePath(`/platform/tenants/${tenantId}/settings`);
  redirect(`/platform/tenants/${tenantId}/settings?ok=1`);
}

export async function updatePlatformTenantPlanMetadataAction(formData: FormData) {
  const ctx = await platformCtxOrRedirect();
  const tenantId = String(formData.get("tenantId") ?? "");
  const payload: Record<string, unknown> = { tenantId };
  const plan = formData.get("saasPlan");
  if (plan != null && String(plan).trim() !== "") payload.saasPlan = String(plan).trim();
  const sub = formData.get("subscriptionStatus");
  if (sub != null && String(sub).trim() !== "") payload.subscriptionStatus = String(sub).trim();
  if (formData.get("trialClear") === "on") {
    payload.trialEndsAt = null;
  } else {
    const trial = formData.get("trialEndsAt");
    if (trial != null && String(trial).trim() !== "") {
      const d = new Date(`${String(trial)}T12:00:00`);
      if (!Number.isNaN(d.getTime())) payload.trialEndsAt = d;
    }
  }
  if (formData.get("billingClear") === "on") {
    payload.billingCustomerId = null;
  } else {
    const billing = formData.get("billingCustomerId");
    if (billing != null && String(billing).trim() !== "") {
      payload.billingCustomerId = String(billing).trim().slice(0, 255);
    }
  }
  if (formData.get("notesClear") === "on") {
    payload.platformInternalNotes = null;
  } else {
    const notes = formData.get("platformInternalNotes");
    if (notes != null && String(notes).trim() !== "") {
      payload.platformInternalNotes = String(notes).slice(0, 8000);
    }
  }
  try {
    await updatePlatformTenantPlanMetadata(payload, ctx);
  } catch (e) {
    if (e instanceof ServiceError) {
      redirect(`/platform/tenants/${tenantId}/settings?err=${encodeURIComponent(e.message)}`);
    }
    redirect(`/platform/tenants/${tenantId}/settings?err=${encodeURIComponent("Error al guardar")}`);
  }
  revalidatePath("/platform/tenants");
  revalidatePath(`/platform/tenants/${tenantId}`);
  revalidatePath(`/platform/tenants/${tenantId}/settings`);
  redirect(`/platform/tenants/${tenantId}/settings?ok=1`);
}

export async function updatePlatformTenantModuleAction(formData: FormData) {
  const ctx = await platformCtxOrRedirect();
  const tenantId = String(formData.get("tenantId") ?? "");
  const moduleKey = String(formData.get("moduleKey") ?? "");
  const enabledRaw = formData.get("isEnabled");
  if (typeof enabledRaw !== "string" || (enabledRaw !== "true" && enabledRaw !== "false")) {
    redirect(`/platform/tenants/${tenantId}/modules?err=${encodeURIComponent("Estado del módulo inválido")}`);
  }
  const isEnabled = enabledRaw === "true";
  const notesRaw = formData.get("internalNotes");
  const internalNotes =
    notesRaw === null || String(notesRaw).trim() === "" ? null : String(notesRaw).slice(0, 2000);
  try {
    await updateTenantModuleSetting(
      { tenantId, moduleKey, isEnabled, internalNotes },
      ctx,
    );
  } catch (e) {
    if (e instanceof ServiceError) {
      redirect(`/platform/tenants/${tenantId}/modules?err=${encodeURIComponent(e.message)}`);
    }
    redirect(`/platform/tenants/${tenantId}/modules?err=${encodeURIComponent("Error al guardar")}`);
  }
  revalidatePath(`/platform/tenants/${tenantId}/modules`);
  revalidatePath(`/platform/tenants/${tenantId}`);
  redirect(`/platform/tenants/${tenantId}/modules?ok=1`);
}
