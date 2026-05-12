"use server";

import {
  createProject,
  updateProject,
  activateProject,
  pauseProject,
  resumeProject,
  completeProject,
  cancelProject,
  ServiceError,
} from "@bloqer/services";
import {
  createProjectSchema,
  updateProjectSchema,
  type CreateProjectInput,
  type UpdateProjectInput,
} from "@bloqer/validators";
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

export async function createProjectAction(
  data: CreateProjectInput,
): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx();
  const parsed = createProjectSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    const project = await createProject(parsed.data, ctx);
    return { id: project.id };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: "Error inesperado al crear el proyecto" };
  }
}

export async function updateProjectAction(
  id: string,
  data: UpdateProjectInput,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  const parsed = updateProjectSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await updateProject(id, parsed.data, ctx);
    revalidatePath(`/proyectos/${id}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: "Error inesperado al actualizar el proyecto" };
  }
}

export async function activateProjectAction(id: string): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  try {
    await activateProject(id, ctx);
    revalidatePath(`/proyectos/${id}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: "Error inesperado" };
  }
}

export async function pauseProjectAction(id: string): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  try {
    await pauseProject(id, ctx);
    revalidatePath(`/proyectos/${id}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: "Error inesperado" };
  }
}

export async function resumeProjectAction(id: string): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  try {
    await resumeProject(id, ctx);
    revalidatePath(`/proyectos/${id}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: "Error inesperado" };
  }
}

export async function completeProjectAction(id: string): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  try {
    await completeProject(id, ctx);
    revalidatePath(`/proyectos/${id}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: "Error inesperado" };
  }
}

export async function cancelProjectAction(id: string): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  try {
    await cancelProject(id, ctx);
    revalidatePath(`/proyectos/${id}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: "Error inesperado" };
  }
}
