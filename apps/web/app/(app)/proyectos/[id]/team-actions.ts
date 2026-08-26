"use server";

import {
  addProjectTeamMember,
  removeProjectTeamMember,
  listActiveMembersForProjectTeamPicker,
  ServiceError,
} from "@bloqer/services";
import { addProjectTeamMemberSchema, projectTeamMemberIdSchema } from "@bloqer/validators";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

async function getCtx() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  return {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };
}

export async function addProjectTeamMemberAction(
  projectId: string,
  data: { userId: string; kind: "PROJECT_MANAGER" | "SITE_FOREMAN" | "OTHER" },
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  const parsed = addProjectTeamMemberSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await addProjectTeamMember(projectId, parsed.data, ctx);
    revalidatePath(`/proyectos/${projectId}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: "Error inesperado al agregar al equipo" };
  }
}

export async function removeProjectTeamMemberAction(
  projectId: string,
  memberId: string,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  if (!projectTeamMemberIdSchema.safeParse(memberId).success) {
    return { error: "Miembro del equipo no encontrado" };
  }
  try {
    await removeProjectTeamMember(projectId, memberId, ctx);
    revalidatePath(`/proyectos/${projectId}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: "Error inesperado al quitar del equipo" };
  }
}

export async function listProjectTeamPickerAction(
  projectId: string,
): Promise<
  | { ok: true; options: Array<{ userId: string; email: string; name: string | null; roles: string[] }> }
  | { error: string }
> {
  const ctx = await getCtx();
  try {
    const options = await listActiveMembersForProjectTeamPicker(projectId, ctx);
    return { ok: true, options };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: "Error al cargar usuarios" };
  }
}
