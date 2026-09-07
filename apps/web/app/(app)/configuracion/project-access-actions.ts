"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
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

const projectIdsSchema = z.array(z.string().uuid()).max(500);

export async function saveUserProjectAccessAction(
  membershipId: string,
  userId: string,
  projectIds: string[],
): Promise<{ ok: true } | { error: string }> {
  const ctx = await buildTenantServiceContext();
  if (!ctx) return { error: "Sesión inválida" };
  const parsedIds = projectIdsSchema.safeParse(projectIds);
  if (!parsedIds.success) {
    return { error: "Lista de obras inválida." };
  }
  const parsedUserId = z.string().uuid().safeParse(userId);
  const parsedMembershipId = z.string().uuid().safeParse(membershipId);
  if (!parsedUserId.success || !parsedMembershipId.success) {
    return { error: "Identificadores inválidos." };
  }
  try {
    // Bind Equipo membership row → userId (reject cross-user ID swap from the client).
    const member = await getTenantMemberById(parsedMembershipId.data, ctx);
    if (member.userId !== parsedUserId.data) {
      return { error: "El usuario no coincide con el miembro del equipo." };
    }
    await setUserProjectMemberships(member.userId, parsedIds.data, ctx);
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
  const parsedUserId = z.string().uuid().safeParse(userId);
  if (!parsedUserId.success) return { error: "Usuario inválido" as const };
  try {
    const editor = await getUserProjectAccessEditor(parsedUserId.data, ctx);
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
  const parsed = z
    .object({
      mode: z.enum(["TENANT_WIDE", "MEMBERSHIP_SCOPED"]),
      confirmLockouts: z.boolean().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { error: "Parámetros inválidos." };
  try {
    const result = await setTenantProjectAccessMode(
      {
        mode: parsed.data.mode,
        // Only true when client explicitly confirms; server recomputes lockout preview.
        confirmLockouts: parsed.data.confirmLockouts === true,
      },
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
  const parsed = z.string().uuid().safeParse(projectId);
  if (!parsed.success) return { error: "Obra inválida" as const };
  try {
    const preview = await previewImportMembershipsFromProjectTeam(parsed.data, ctx);
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
  const parsed = z.string().uuid().safeParse(projectId);
  if (!parsed.success) return { error: "Obra inválida" };
  try {
    const result = await importMembershipsFromProjectTeam(parsed.data, ctx);
    revalidatePath("/configuracion/equipo");
    revalidatePath("/configuracion/politicas");
    return { ok: true, created: result.created };
  } catch (e) {
    return { error: errMessage(e) };
  }
}
