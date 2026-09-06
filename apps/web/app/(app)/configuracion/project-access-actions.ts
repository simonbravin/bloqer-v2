"use server";

import { revalidatePath } from "next/cache";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import {
  getTenantMemberById,
  getUserProjectAccessEditor,
  importMembershipsFromProjectTeam,
  previewImportMembershipsFromProjectTeam,
  previewMembershipScopedActivation,
  setTenantProjectAccessMode,
  setUserProjectMemberships,
  ServiceError,
} from "@bloqer/services";

function errMessage(e: unknown): string {
  if (e instanceof ServiceError) return e.message;
  if (e instanceof Error) return e.message;
  return "Error inesperado";
}

export async function saveUserProjectAccessAction(
  membershipId: string,
  userId: string,
  projectIds: string[],
): Promise<{ ok: true } | { error: string }> {
  const ctx = await buildTenantServiceContext();
  if (!ctx) return { error: "Sesión inválida" };
  try {
    // Bind Equipo membership row → userId (reject cross-user ID swap from the client).
    const member = await getTenantMemberById(membershipId, ctx);
    if (member.userId !== userId) {
      return { error: "El usuario no coincide con el miembro del equipo." };
    }
    await setUserProjectMemberships(member.userId, projectIds, ctx);
    revalidatePath(`/configuracion/equipo/${membershipId}`);
    revalidatePath("/configuracion/equipo");
    revalidatePath("/configuracion/politicas");
    revalidatePath("/proyectos");
    return { ok: true };
  } catch (e) {
    return { error: errMessage(e) };
  }
}

export async function loadUserProjectAccessAction(userId: string) {
  const ctx = await buildTenantServiceContext();
  if (!ctx) return { error: "Sesión inválida" as const };
  try {
    const editor = await getUserProjectAccessEditor(userId, ctx);
    return { ok: true as const, editor };
  } catch (e) {
    return { error: errMessage(e) };
  }
}

export async function previewProjectAccessModeAction() {
  const ctx = await buildTenantServiceContext();
  if (!ctx) return { error: "Sesión inválida" as const };
  try {
    const preview = await previewMembershipScopedActivation(ctx);
    return { ok: true as const, preview };
  } catch (e) {
    return { error: errMessage(e) };
  }
}

export async function setProjectAccessModeAction(input: {
  mode: "TENANT_WIDE" | "MEMBERSHIP_SCOPED";
  confirmLockouts?: boolean;
}): Promise<{ ok: true; mode: string } | { error: string }> {
  const ctx = await buildTenantServiceContext();
  if (!ctx) return { error: "Sesión inválida" };
  try {
    const result = await setTenantProjectAccessMode(
      { mode: input.mode, confirmLockouts: input.confirmLockouts },
      ctx,
    );
    revalidatePath("/configuracion/politicas");
    revalidatePath("/configuracion/equipo");
    revalidatePath("/proyectos");
    return { ok: true, mode: result.mode };
  } catch (e) {
    return { error: errMessage(e) };
  }
}

export async function previewImportTeamMembershipsAction(projectId: string) {
  const ctx = await buildTenantServiceContext();
  if (!ctx) return { error: "Sesión inválida" as const };
  try {
    const preview = await previewImportMembershipsFromProjectTeam(projectId, ctx);
    return { ok: true as const, preview };
  } catch (e) {
    return { error: errMessage(e) };
  }
}

export async function importTeamMembershipsAction(
  projectId: string,
): Promise<{ ok: true; created: number } | { error: string }> {
  const ctx = await buildTenantServiceContext();
  if (!ctx) return { error: "Sesión inválida" };
  try {
    const result = await importMembershipsFromProjectTeam(projectId, ctx);
    revalidatePath("/configuracion/equipo");
    revalidatePath("/configuracion/politicas");
    return { ok: true, created: result.created };
  } catch (e) {
    return { error: errMessage(e) };
  }
}
