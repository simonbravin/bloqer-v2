"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { UserRole } from "@bloqer/domain";
import { OVERVIEW_ROLES } from "@bloqer/domain";
import {
  ServiceError,
  updateTenantDisplaySettings,
  updateTenantMemberRoles,
  updateTenantMemberStatus,
} from "@bloqer/services";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";

function collectRolesFromForm(formData: FormData): UserRole[] {
  const roles: UserRole[] = [];
  for (const r of OVERVIEW_ROLES) {
    if (formData.get(`role_${r}`) === "on") roles.push(r);
  }
  return roles;
}

export async function updateTenantDisplaySettingsAction(formData: FormData) {
  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");
  const name = String(formData.get("name") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();
  const baseCurrency = String(formData.get("baseCurrency") ?? "").trim();
  try {
    await updateTenantDisplaySettings({ name, timezone, baseCurrency }, ctx);
  } catch (e) {
    if (e instanceof ServiceError) {
      redirect(`/configuracion?err=${encodeURIComponent(e.message)}`);
    }
    redirect(`/configuracion?err=${encodeURIComponent("Error al guardar")}`);
  }
  revalidatePath("/configuracion");
  redirect("/configuracion?ok=1");
}

export async function updateTenantMemberRolesAction(formData: FormData) {
  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");
  const membershipId = String(formData.get("membershipId") ?? "");
  const roles = collectRolesFromForm(formData);
  try {
    await updateTenantMemberRoles(membershipId, roles, ctx);
  } catch (e) {
    if (e instanceof ServiceError) {
      redirect(`/configuracion/equipo/${membershipId}?err=${encodeURIComponent(e.message)}`);
    }
    redirect(`/configuracion/equipo/${membershipId}?err=${encodeURIComponent("Error al guardar roles")}`);
  }
  revalidatePath("/configuracion/equipo");
  revalidatePath(`/configuracion/equipo/${membershipId}`);
  redirect(`/configuracion/equipo/${membershipId}?ok=1`);
}

export async function updateTenantMemberStatusAction(formData: FormData) {
  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");
  const membershipId = String(formData.get("membershipId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (status !== "ACTIVE" && status !== "INACTIVE") {
    redirect(`/configuracion/equipo/${membershipId}?err=${encodeURIComponent("Estado inválido")}`);
  }
  try {
    await updateTenantMemberStatus(membershipId, status, ctx);
  } catch (e) {
    if (e instanceof ServiceError) {
      redirect(`/configuracion/equipo/${membershipId}?err=${encodeURIComponent(e.message)}`);
    }
    redirect(`/configuracion/equipo/${membershipId}?err=${encodeURIComponent("Error al cambiar estado")}`);
  }
  revalidatePath("/configuracion/equipo");
  revalidatePath(`/configuracion/equipo/${membershipId}`);
  redirect(`/configuracion/equipo/${membershipId}?ok=1`);
}
