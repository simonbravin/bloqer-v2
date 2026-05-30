"use server";

import {
  createProject,
  updateProject,
  activateProject,
  pauseProject,
  resumeProject,
  completeProject,
  cancelProject,
  reactivateProject,
  getProjectCancellationImpact,
  ServiceError,
} from "@bloqer/services";
import {
  createProjectSchema,
  updateProjectSchema,
  projectLifecycleInputSchema,
  projectReactivateInputSchema,
  type CreateProjectInput,
  type UpdateProjectInput,
  type ProjectLifecycleInput,
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

function revalidateProject(id: string) {
  revalidatePath(`/proyectos/${id}`);
  revalidatePath("/proyectos");
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
    revalidateProject(id);
    return { ok: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: "Error inesperado al actualizar el proyecto" };
  }
}

export async function activateProjectAction(
  id: string,
  data?: ProjectLifecycleInput,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  const parsed = projectLifecycleInputSchema.safeParse(data ?? {});
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await activateProject(id, ctx, parsed.data);
    revalidateProject(id);
    return { ok: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: "Error inesperado" };
  }
}

export async function pauseProjectAction(
  id: string,
  data?: ProjectLifecycleInput,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  const parsed = projectLifecycleInputSchema.safeParse(data ?? {});
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await pauseProject(id, ctx, parsed.data);
    revalidateProject(id);
    return { ok: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: "Error inesperado" };
  }
}

export async function resumeProjectAction(
  id: string,
  data?: ProjectLifecycleInput,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  const parsed = projectLifecycleInputSchema.safeParse(data ?? {});
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await resumeProject(id, ctx, parsed.data);
    revalidateProject(id);
    return { ok: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: "Error inesperado" };
  }
}

export async function completeProjectAction(
  id: string,
  data?: ProjectLifecycleInput,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  const parsed = projectLifecycleInputSchema.safeParse(data ?? {});
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await completeProject(id, ctx, parsed.data);
    revalidateProject(id);
    return { ok: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: "Error inesperado" };
  }
}

export async function cancelProjectAction(
  id: string,
  data?: ProjectLifecycleInput,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  const parsed = projectLifecycleInputSchema.safeParse(data ?? {});
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await cancelProject(id, ctx, parsed.data);
    revalidateProject(id);
    return { ok: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: "Error inesperado" };
  }
}

export async function reactivateProjectAction(
  id: string,
  data: ProjectLifecycleInput,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx();
  const parsed = projectReactivateInputSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  try {
    await reactivateProject(id, ctx, parsed.data);
    revalidateProject(id);
    return { ok: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: "Error inesperado" };
  }
}

export async function getProjectCancellationImpactAction(id: string) {
  const ctx = await getCtx();
  try {
    return { ok: true as const, impact: await getProjectCancellationImpact(id, ctx) };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: "Error inesperado" };
  }
}
